import express from 'express'
import { PrismaClient } from '@prisma/client'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

const router = express.Router()
const prisma = new PrismaClient()

// Configure multer for banner image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/images/banners'
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'banner-' + uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'), false)
    }
  }
})

// Get all banners (public endpoint)
router.get('/', async (req, res) => {
  try {
    const banners = await prisma.banner.findMany({
      where: {
        is_active: true
      },
      orderBy: {
        sort_order: 'asc'
      }
    })

    res.json({
      success: true,
      data: banners
    })
  } catch (error) {
    console.error('❌ Error fetching banners:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banners',
      error: error.message
    })
  }
})

// Get all banners for admin (includes inactive)
router.get('/admin', async (req, res) => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: [
        { sort_order: 'asc' },
        { created_at: 'desc' }
      ]
    })

    res.json({
      success: true,
      data: banners
    })
  } catch (error) {
    console.error('❌ Error fetching admin banners:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banners',
      error: error.message
    })
  }
})

// Create new banner
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, subtitle, link_url, link_text, is_active, sort_order } = req.body
    
    let image_url = null
    if (req.file) {
      image_url = `/images/banners/${req.file.filename}`
    }

    const banner = await prisma.banner.create({
      data: {
        title,
        subtitle: subtitle || null,
        image_url,
        link_url: link_url || null,
        link_text: link_text || null,
        is_active: is_active === 'true' || is_active === true,
        sort_order: parseInt(sort_order) || 0
      }
    })

    res.json({
      success: true,
      data: banner,
      message: 'Banner created successfully'
    })
  } catch (error) {
    console.error('❌ Error creating banner:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create banner',
      error: error.message
    })
  }
})

// Update banner
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params
    const { title, subtitle, link_url, link_text, is_active, sort_order } = req.body

    // Get existing banner to handle image replacement
    const existingBanner = await prisma.banner.findUnique({
      where: { id }
    })

    if (!existingBanner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      })
    }

    let image_url = existingBanner.image_url
    if (req.file) {
      // Delete old image if it exists
      if (existingBanner.image_url) {
        const oldImagePath = path.join('public', existingBanner.image_url)
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath)
        }
      }
      image_url = `/images/banners/${req.file.filename}`
    }

    const banner = await prisma.banner.update({
      where: { id },
      data: {
        title,
        subtitle: subtitle || null,
        image_url,
        link_url: link_url || null,
        link_text: link_text || null,
        is_active: is_active === 'true' || is_active === true,
        sort_order: parseInt(sort_order) || 0
      }
    })

    res.json({
      success: true,
      data: banner,
      message: 'Banner updated successfully'
    })
  } catch (error) {
    console.error('❌ Error updating banner:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update banner',
      error: error.message
    })
  }
})

// Delete banner
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    // Get banner to delete associated image
    const banner = await prisma.banner.findUnique({
      where: { id }
    })

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      })
    }

    // Delete image file if it exists
    if (banner.image_url) {
      const imagePath = path.join('public', banner.image_url)
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath)
      }
    }

    await prisma.banner.delete({
      where: { id }
    })

    res.json({
      success: true,
      message: 'Banner deleted successfully'
    })
  } catch (error) {
    console.error('❌ Error deleting banner:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete banner',
      error: error.message
    })
  }
})

// Update banner order
router.put('/reorder', async (req, res) => {
  try {
    const { banners } = req.body // Array of { id, sort_order }

    const updatePromises = banners.map(banner =>
      prisma.banner.update({
        where: { id: banner.id },
        data: { sort_order: banner.sort_order }
      })
    )

    await Promise.all(updatePromises)

    res.json({
      success: true,
      message: 'Banner order updated successfully'
    })
  } catch (error) {
    console.error('❌ Error updating banner order:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to update banner order',
      error: error.message
    })
  }
})

export default router
