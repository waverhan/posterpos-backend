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

// POST /branches
app.post('/branches', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig)
    const {
      name,
      address,
      phone,
      working_hours,
      latitude,
      longitude,
      poster_id
    } = req.body

    // Generate simple ID
    const id = 'branch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)

    const [result] = await connection.execute(`
      INSERT INTO branches (id, poster_id, name, address, phone, working_hours, is_active, latitude, longitude, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [
      id,
      poster_id || null,
      name,
      address || '',
      phone || '',
      working_hours || '10:00-22:00',
      1,
      latitude || 50.4501,
      longitude || 30.5234
    ])

    // Get the created branch
    const [branches] = await connection.execute('SELECT * FROM branches WHERE id = ?', [id])
    await connection.end()

    res.status(201).json({
      success: true,
      branch: branches[0]
    })
  } catch (error) {
    console.error('Error creating branch:', error)
    res.status(500).json({ success: false, error: 'Failed to create branch' })
  }
})

// PUT /branches/:id
app.put('/branches/:id', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig)
    const branchId = req.params.id
    const {
      name,
      address,
      phone,
      working_hours,
      latitude,
      longitude,
      is_active
    } = req.body

    await connection.execute(`
      UPDATE branches 
      SET name = ?, address = ?, phone = ?, working_hours = ?, latitude = ?, longitude = ?, is_active = ?, updated_at = NOW()
      WHERE id = ?
    `, [
      name,
      address,
      phone,
      working_hours,
      latitude,
      longitude,
      is_active !== undefined ? is_active : 1,
      branchId
    ])

    // Get the updated branch
    const [branches] = await connection.execute('SELECT * FROM branches WHERE id = ?', [branchId])
    await connection.end()

    if (branches.length === 0) {
      return res.status(404).json({ success: false, error: 'Branch not found' })
    }

    res.json({
      success: true,
      branch: branches[0]
    })
  } catch (error) {
    console.error('Error updating branch:', error)
    res.status(500).json({ success: false, error: 'Failed to update branch' })
  }
})

// Export for Netlify Functions
module.exports.handler = serverless(app)
