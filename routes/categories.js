import express from 'express'
import { PrismaClient } from '@prisma/client'
import { getCategories, createCategory } from '../services/database.js'

const prisma = new PrismaClient()

const router = express.Router()

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const categories = await getCategories()
    res.json(categories)
  } catch (error) {
    console.error('Error fetching categories:', error)
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})

// POST /api/categories
router.post('/', async (req, res) => {
  try {
    const { name, display_name, description, image_url, sort_order, is_active } = req.body

    const category = await prisma.category.create({
      data: {
        name,
        display_name,
        description,
        image_url,
        sort_order: sort_order || 0,
        is_active: is_active !== undefined ? is_active : true
      },
      include: {
        products: {
          where: { is_active: true },
          select: { id: true }
        }
      }
    })

    const formattedCategory = {
      id: category.id,
      name: category.name,
      display_name: category.display_name,
      description: category.description || '',
      image_url: category.image_url || '',
      sort_order: category.sort_order,
      is_active: category.is_active,
      created_at: category.created_at.toISOString(),
      updated_at: category.updated_at.toISOString(),
      product_count: category.products.length
    }

    res.status(201).json(formattedCategory)
  } catch (error) {
    console.error('Error creating category:', error)
    res.status(500).json({ error: 'Failed to create category' })
  }
})

// PUT /api/categories/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, display_name, description, image_url, sort_order, is_active } = req.body

    const category = await prisma.category.update({
      where: { id },
      data: {
        name,
        display_name,
        description,
        image_url,
        sort_order,
        is_active
      },
      include: {
        products: {
          where: { is_active: true },
          select: { id: true }
        }
      }
    })

    const formattedCategory = {
      id: category.id,
      name: category.name,
      display_name: category.display_name,
      description: category.description || '',
      image_url: category.image_url || '',
      sort_order: category.sort_order,
      is_active: category.is_active,
      created_at: category.created_at.toISOString(),
      updated_at: category.updated_at.toISOString(),
      product_count: category.products.length
    }

    res.json(formattedCategory)
  } catch (error) {
    console.error('Error updating category:', error)
    res.status(500).json({ error: 'Failed to update category' })
  }
})

export default router
