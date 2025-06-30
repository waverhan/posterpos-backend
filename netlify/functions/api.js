const express = require('express')
const cors = require('cors')
const serverless = require('serverless-http')
const mysql = require('mysql2/promise')

const app = express()

// Database configuration
const dbConfig = {
  host: 'avalon.cityhost.com.ua',
  port: 3306,
  user: 'ch6edd8920_pwapos',
  password: 'mA1ZDUY7fA',
  database: 'ch6edd8920_pwapos',
  charset: 'utf8mb4'
}

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
}))

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'PWA POS Backend API - Separate Netlify Deployment',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  })
})

// Get products - Working implementation
app.get('/api/products', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig)
    
    let query = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.is_active = 1
    `
    
    const params = []
    
    // Filter by category if provided
    if (req.query.categoryId || req.query.category_id) {
      const categoryId = req.query.categoryId || req.query.category_id
      query += ' AND p.category_id = ?'
      params.push(categoryId)
    }
    
    query += ' ORDER BY p.name'
    
    const [products] = await connection.execute(query, params)
    await connection.end()
    
    // Map database fields to frontend expected fields
    const mappedProducts = products.map(product => {
      const stockQuantity = parseFloat(product.stock_quantity || 0)
      
      return {
        id: product.id,
        poster_id: product.poster_id,
        category_id: product.category_id,
        name: product.name,
        description: product.description || '',
        price: parseFloat(product.price || 0),
        image_url: product.image_url || '',
        is_active: Boolean(product.is_active),
        stock_quantity: product.stock_quantity,
        unit: product.unit || 'шт',
        attributes: product.attributes,
        created_at: product.created_at,
        updated_at: product.updated_at,
        category_name: product.category_name,
        
        // Frontend expected fields
        quantity: stockQuantity,
        available: Boolean(product.is_active) && stockQuantity > 0
      }
    })
    
    res.json(mappedProducts)
  } catch (error) {
    console.error('Products error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Get categories
app.get('/api/categories', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig)
    const [categories] = await connection.execute('SELECT * FROM categories ORDER BY name')
    await connection.end()
    
    res.json(categories)
  } catch (error) {
    console.error('Categories error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Sync endpoint
app.post('/api/sync/full', async (req, res) => {
  let connection = null

  try {
    console.log('🔄 Starting Netlify sync...')
    connection = await mysql.createConnection(dbConfig)

    let results = { categories: 0, products: 0, branches: 0 }

    const POSTER_API_BASE = 'https://joinposter.com/api'
    const POSTER_TOKEN = '218047:05891220e474bad7f26b6eaa0be3f344'

    // Import fetch for Node.js
    const fetch = require('node-fetch')

    // Generate simple ID
    function generateId() {
      return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    }

    // Sync categories
    console.log('📂 Syncing categories...')
    const categoriesResponse = await fetch(`${POSTER_API_BASE}/menu.getCategories?token=${POSTER_TOKEN}`)
    const categoriesData = await categoriesResponse.json()

    if (categoriesData.response) {
      for (const cat of categoriesData.response) {
        try {
          await connection.execute(`
            INSERT INTO categories (id, poster_id, name, description, sort_order, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW()
          `, [
            generateId(),
            cat.category_id,
            cat.category_name,
            `Category: ${cat.category_name}`,
            parseInt(cat.sort_order) || 0,
            1
          ])
          results.categories++
        } catch (err) {
          console.error('Category sync error:', err.message)
        }
      }
    }

    // Sync products
    console.log('🛍️  Syncing products...')
    const productsResponse = await fetch(`${POSTER_API_BASE}/menu.getProducts?token=${POSTER_TOKEN}`)
    const productsData = await productsResponse.json()

    if (productsData.response) {
      for (const product of productsData.response) {
        try {
          // Find category
          const [categoryResult] = await connection.execute(
            'SELECT id FROM categories WHERE poster_id = ? LIMIT 1',
            [product.category_id]
          )

          let categoryId = null
          if (categoryResult.length > 0) {
            categoryId = categoryResult[0].id
          } else {
            // Use first available category
            const [firstCat] = await connection.execute('SELECT id FROM categories LIMIT 1')
            if (firstCat.length > 0) {
              categoryId = firstCat[0].id
            }
          }

          if (!categoryId) continue

          // Calculate price
          let price = 0
          if (product.price) {
            if (typeof product.price === 'object') {
              price = parseFloat(product.price['1'] || product.price['0'] || 0) / 100
            } else {
              price = parseFloat(product.price) / 100
            }
          }

          await connection.execute(`
            INSERT INTO products (id, poster_id, category_id, name, description, price, is_active, stock_quantity, unit, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), updated_at = NOW()
          `, [
            generateId(),
            product.product_id,
            categoryId,
            product.product_name,
            product.product_name,
            price,
            1,
            0,
            'шт'
          ])
          results.products++
        } catch (err) {
          console.error('Product sync error:', err.message)
        }
      }
    }

    console.log(`✅ Netlify sync completed: ${results.categories} categories, ${results.products} products, ${results.branches} branches`)

    res.json({
      success: true,
      message: 'Netlify sync completed',
      results: results
    })

  } catch (error) {
    console.error('Netlify sync error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  } finally {
    if (connection) {
      await connection.end()
    }
  }
})

// Get banners
app.get('/api/banners', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig)

    // Try to get banners from database
    let banners = []
    try {
      const [dbBanners] = await connection.execute('SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order')
      banners = dbBanners
    } catch (dbError) {
      console.log('Database banners not available, using fallback data:', dbError.message)
      // Fallback to mock data if database table doesn't exist
      banners = [
        {
          id: 1,
          title: 'Welcome to Our Store!',
          description: 'Fresh products delivered to your door',
          image_url: '/images/banner1.jpg',
          link_url: '/shop',
          is_active: 1,
          sort_order: 1
        },
        {
          id: 2,
          title: 'Special Offers',
          description: 'Get 20% off on your first order',
          image_url: '/images/banner2.jpg',
          link_url: '/shop?category=specials',
          is_active: 1,
          sort_order: 2
        }
      ]
    }

    await connection.end()

    res.json({
      success: true,
      banners: banners
    })
  } catch (error) {
    console.error('Banners error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Get branches
app.get('/api/branches', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig)
    const [branches] = await connection.execute('SELECT * FROM branches WHERE is_active = 1 ORDER BY name')
    await connection.end()

    res.json({
      success: true,
      branches: branches
    })
  } catch (error) {
    console.error('Branches error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Get orders
app.get('/api/orders', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig)

    // Try to get orders from database
    let orders = []
    try {
      const [dbOrders] = await connection.execute(`
        SELECT o.*, b.name as branch_name
        FROM orders o
        LEFT JOIN branches b ON o.branch_id = b.id
        ORDER BY o.created_at DESC
        LIMIT 50
      `)
      orders = dbOrders
    } catch (dbError) {
      console.log('Database orders not available, using fallback data:', dbError.message)
      // Fallback to mock data if database table doesn't exist
      orders = [
        {
          id: 'order_demo_1',
          customer_name: 'John Doe',
          customer_phone: '+380971234567',
          total: 150.00,
          status: 'completed',
          branch_name: 'Main Store',
          created_at: new Date().toISOString()
        },
        {
          id: 'order_demo_2',
          customer_name: 'Jane Smith',
          customer_phone: '+380971234568',
          total: 89.50,
          status: 'pending',
          branch_name: 'Main Store',
          created_at: new Date().toISOString()
        }
      ]
    }

    await connection.end()

    res.json({
      success: true,
      orders: orders
    })
  } catch (error) {
    console.error('Orders error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Analytics endpoints
app.post('/api/analytics/event', async (req, res) => {
  try {
    console.log('Analytics event:', req.body)
    res.json({ success: true, message: 'Analytics event logged' })
  } catch (error) {
    console.error('Analytics event error:', error)
    res.status(500).json({ error: 'Failed to track event' })
  }
})

app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query

    res.json({
      success: true,
      data: {
        overview: {
          total_events: 0,
          total_sessions: 0,
          unique_users: 0,
          conversion_rate: 0
        },
        top_events: [],
        top_pages: [],
        device_breakdown: {},
        timeframe,
        date_range: {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString()
        }
      }
    })
  } catch (error) {
    console.error('Analytics dashboard error:', error)
    res.status(500).json({ error: 'Failed to get analytics data' })
  }
})

// Site config endpoint
app.get('/api/site-config', (req, res) => {
  res.json({
    success: true,
    config: {
      site_name: 'PWA POS Shop',
      currency: 'UAH',
      delivery_fee: 50,
      min_order_amount: 200,
      working_hours: '10:00-22:00',
      contact_phone: '+38 (097) 324 46 68',
      contact_email: 'info@pwapos.com'
    }
  })
})

// Export for Netlify Functions
module.exports.handler = serverless(app)
