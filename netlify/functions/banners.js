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

// GET / (root path for Netlify functions)
app.get('/', async (req, res) => {
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

// Export for Netlify Functions
module.exports.handler = serverless(app)
