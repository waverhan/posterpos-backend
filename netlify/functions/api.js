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

// Export for Netlify Functions
module.exports.handler = serverless(app)
