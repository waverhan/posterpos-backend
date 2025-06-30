const express = require('express')
const cors = require('cors')
const serverless = require('serverless-http')

const app = express()

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
}))

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Handle all analytics endpoints at root
app.all('/', async (req, res) => {
  // Default analytics response
  try {
    if (req.method === 'POST') {
      console.log('Analytics event/session:', req.body)
      res.json({ success: true, message: 'Analytics logged' })
    } else {
      // GET request - return dashboard data
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
    }
  } catch (error) {
    console.error('Analytics error:', error)
    res.status(500).json({ error: 'Failed to process analytics request' })
  }
})

// Export for Netlify Functions
module.exports.handler = serverless(app)
