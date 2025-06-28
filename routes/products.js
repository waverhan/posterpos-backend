import express from 'express'
import { getProducts, createProduct, prisma } from '../services/database.js'

const router = express.Router()

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { categoryId, branchId } = req.query
    const products = await getProducts(categoryId, branchId)
    res.json(products)
  } catch (error) {
    console.error('Error fetching products:', error)
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const product = await createProduct(req.body)
    res.status(201).json(product)
  } catch (error) {
    console.error('Error creating product:', error)
    res.status(500).json({ error: 'Failed to create product' })
  }
})

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const {
      poster_product_id,
      category_id,
      name,
      display_name,
      description,
      price,
      original_price,
      image_url,
      display_image_url,
      is_active,
      requires_bottles,
      attributes,
      custom_quantity,
      custom_unit,
      quantity_step,
      min_quantity,
      max_quantity
    } = req.body

    const product = await prisma.product.update({
      where: { id },
      data: {
        poster_product_id,
        category_id,
        name,
        display_name,
        description,
        price,
        original_price,
        image_url,
        display_image_url,
        is_active,
        requires_bottles: requires_bottles || false,
        attributes: attributes ? JSON.stringify(attributes) : null,
        custom_quantity: custom_quantity || null,
        custom_unit: custom_unit || null,
        quantity_step: quantity_step || null,
        min_quantity: min_quantity || null,
        max_quantity: max_quantity || null
      },
      include: {
        category: true,
        inventory: true
      }
    })

    const inventory = product.inventory[0] // Get first inventory if available

    const formattedProduct = {
      id: product.id,
      poster_product_id: product.poster_product_id,
      ingredient_id: product.ingredient_id,
      category_id: product.category_id,
      name: product.name,
      display_name: product.display_name,
      description: product.description || '',
      price: product.price,
      original_price: product.original_price,
      image_url: product.image_url || '',
      display_image_url: product.display_image_url || '',
      quantity: inventory?.quantity || 0,
      unit: inventory?.unit || 'pcs',
      available: inventory ? inventory.quantity > 0 : false,
      is_active: product.is_active,
      requires_bottles: product.requires_bottles || false,
      attributes: product.attributes ? JSON.parse(product.attributes) : [],
      custom_quantity: product.custom_quantity,
      custom_unit: product.custom_unit,
      quantity_step: product.quantity_step,
      min_quantity: product.min_quantity,
      max_quantity: product.max_quantity,
      category: product.category ? {
        id: product.category.id,
        name: product.category.name,
        display_name: product.category.display_name
      } : null,
      created_at: product.created_at.toISOString(),
      updated_at: product.updated_at.toISOString()
    }

    res.json(formattedProduct)
  } catch (error) {
    console.error('Error updating product:', error)
    res.status(500).json({ error: 'Failed to update product' })
  }
})

// GET /api/products/:id/inventory/:branchId - Get detailed inventory information for a product in a specific branch
router.get('/:id/inventory/:branchId', async (req, res) => {
  try {
    const { id: productId, branchId } = req.params
    

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    })

    if (!product) {
      return res.status(404).json({
        is_available: false,
        available_quantity: 0,
        unit: 'p',
        error: 'Product not found'
      })
    }

    // Check if branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: branchId }
    })

    if (!branch) {
      return res.status(404).json({
        is_available: false,
        available_quantity: 0,
        unit: 'p',
        error: 'Branch not found'
      })
    }

    // Check inventory for this product in this branch
    const inventory = await prisma.productInventory.findUnique({
      where: {
        product_id_branch_id: {
          product_id: productId,
          branch_id: branchId
        }
      }
    })

    const availableQuantity = inventory?.quantity || 0
    const unit = inventory?.unit || 'p'
    const isAvailable = availableQuantity > 0

    res.json({
      product_id: productId,
      is_available: isAvailable,
      available_quantity: availableQuantity,
      unit: unit,
      product_name: product.name,
      branch_name: branch.name
    })

  } catch (error) {
    console.error('❌ Error getting product inventory:', error)
    res.status(500).json({
      is_available: false,
      available_quantity: 0,
      unit: 'p',
      error: 'Failed to get inventory'
    })
  }
})

// GET /api/products/:id/availability/:branchId - Check product availability in specific branch (legacy endpoint)
router.get('/:id/availability/:branchId', async (req, res) => {
  try {
    const { id: productId, branchId } = req.params
    

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    })

    if (!product) {
      return res.status(404).json({
        available: false,
        quantity: 0,
        error: 'Product not found'
      })
    }

    // Check if branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: branchId }
    })

    if (!branch) {
      return res.status(404).json({
        available: false,
        quantity: 0,
        error: 'Branch not found'
      })
    }

    // Check inventory for this product in this branch
    const inventory = await prisma.productInventory.findUnique({
      where: {
        product_id_branch_id: {
          product_id: productId,
          branch_id: branchId
        }
      }
    })

    const quantity = inventory?.quantity || 0
    const available = quantity > 0

    res.json({
      available,
      quantity,
      unit: inventory?.unit || 'pcs',
      product_name: product.name,
      branch_name: branch.name
    })

  } catch (error) {
    console.error('❌ Error checking product availability:', error)
    res.status(500).json({
      available: false,
      quantity: 0,
      error: 'Failed to check availability'
    })
  }
})

export default router
