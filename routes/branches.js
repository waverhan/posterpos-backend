import express from 'express'
import { getBranches, createBranch, updateBranch } from '../services/database.js'

const router = express.Router()

// GET /api/branches
router.get('/', async (req, res) => {
  try {
    const branches = await getBranches()
    res.json(branches)
  } catch (error) {
    console.error('Error fetching branches:', error)
    res.status(500).json({ error: 'Failed to fetch branches' })
  }
})

// POST /api/branches
router.post('/', async (req, res) => {
  try {
    const branch = await createBranch(req.body)
    res.status(201).json(branch)
  } catch (error) {
    console.error('Error creating branch:', error)
    res.status(500).json({ error: 'Failed to create branch' })
  }
})

// PUT /api/branches/:id
router.put('/:id', async (req, res) => {
  try {
    
    // Convert ID to string to handle both integer and string IDs
    const branchId = String(req.params.id)
    const branch = await updateBranch(branchId, req.body)
    
    res.json(branch)
  } catch (error) {
    console.error('Error updating branch:', error)
    res.status(500).json({ error: 'Failed to update branch' })
  }
})

export default router
