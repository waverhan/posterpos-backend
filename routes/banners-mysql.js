import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { 
  findMany, 
  findOne, 
  insertOne, 
  updateOne, 
  deleteOne, 
  generateId 
} from '../database/mysql-connection.js'

const router = express.Router()

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'public/images/banners'
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
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
    const allowedTypes = /jpeg|jpg|png|gif|webp/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'))
    }
  }
})

// Get all active banners (public endpoint)
router.get('/', async (req, res) => {
  try {
    const banners = await findMany('banners', 
      { is_active: true }, 
      { 
        orderBy: 'sort_order ASC, created_at DESC',
        fields: 'id, title, subtitle, image_url, link_url, link_text, sort_order'
      }
    )

    res.json({
      success: true,
      banners: banners
    })
  } catch (error) {
    console.error('Error fetching banners:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch banners'
    })
  }
})

// Get all banners for admin (including inactive)
router.get('/admin', async (req, res) => {
  try {
    const banners = await findMany('banners', 
      {}, 
      { 
        orderBy: 'sort_order ASC, created_at DESC'
      }
    )

    res.json({
      success: true,
      banners: banners
    })
  } catch (error) {
    console.error('Error fetching admin banners:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch banners'
    })
  }
})

// Create new banner
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, subtitle, link_url, link_text, is_active, sort_order } = req.body
    
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      })
    }

    const bannerData = {
      id: generateId(),
      title,
      subtitle: subtitle || null,
      link_url: link_url || null,
      link_text: link_text || null,
      is_active: is_active === 'true' || is_active === true,
      sort_order: parseInt(sort_order) || 0,
      image_url: req.file ? `/images/banners/${req.file.filename}` : null,
      created_at: new Date(),
      updated_at: new Date()
    }

    const result = await insertOne('banners', bannerData)

    if (result.affectedRows > 0) {
      const newBanner = await findOne('banners', { id: bannerData.id })
      
      res.status(201).json({
        success: true,
        message: 'Banner created successfully',
        banner: newBanner
      })
    } else {
      throw new Error('Failed to create banner')
    }
  } catch (error) {
    console.error('Error creating banner:', error)
    
    // Clean up uploaded file if banner creation failed
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err)
      })
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create banner'
    })
  }
})

// Update banner
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params
    const { title, subtitle, link_url, link_text, is_active, sort_order } = req.body

    // Check if banner exists
    const existingBanner = await findOne('banners', { id })
    if (!existingBanner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found'
      })
    }

    const updateData = {
      title: title || existingBanner.title,
      subtitle: subtitle !== undefined ? subtitle : existingBanner.subtitle,
      link_url: link_url !== undefined ? link_url : existingBanner.link_url,
      link_text: link_text !== undefined ? link_text : existingBanner.link_text,
      is_active: is_active !== undefined ? (is_active === 'true' || is_active === true) : existingBanner.is_active,
      sort_order: sort_order !== undefined ? parseInt(sort_order) : existingBanner.sort_order,
      updated_at: new Date()
    }

    // Handle image update
    if (req.file) {
      // Delete old image if it exists
      if (existingBanner.image_url) {
        const oldImagePath = path.join('public', existingBanner.image_url)
        fs.unlink(oldImagePath, (err) => {
          if (err) console.error('Error deleting old image:', err)
        })
      }
      
      updateData.image_url = `/images/banners/${req.file.filename}`
    }

    const result = await updateOne('banners', updateData, { id })

    if (result > 0) {
      const updatedBanner = await findOne('banners', { id })
      
      res.json({
        success: true,
        message: 'Banner updated successfully',
        banner: updatedBanner
      })
    } else {
      throw new Error('Failed to update banner')
    }
  } catch (error) {
    console.error('Error updating banner:', error)
    
    // Clean up uploaded file if update failed
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err)
      })
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to update banner'
    })
  }
})

// Delete banner
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    // Get banner to delete associated image
    const banner = await findOne('banners', { id })
    if (!banner) {
      return res.status(404).json({
        success: false,
        error: 'Banner not found'
      })
    }

    // Delete banner from database
    const result = await deleteOne('banners', { id })

    if (result > 0) {
      // Delete associated image file
      if (banner.image_url) {
        const imagePath = path.join('public', banner.image_url)
        fs.unlink(imagePath, (err) => {
          if (err) console.error('Error deleting image file:', err)
        })
      }

      res.json({
        success: true,
        message: 'Banner deleted successfully'
      })
    } else {
      throw new Error('Failed to delete banner')
    }
  } catch (error) {
    console.error('Error deleting banner:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete banner'
    })
  }
})

// Reorder banners
router.put('/reorder', async (req, res) => {
  try {
    const { banners } = req.body

    if (!Array.isArray(banners)) {
      return res.status(400).json({
        success: false,
        error: 'Banners array is required'
      })
    }

    // Update sort order for each banner
    const updatePromises = banners.map((banner, index) => 
      updateOne('banners', 
        { sort_order: index, updated_at: new Date() }, 
        { id: banner.id }
      )
    )

    await Promise.all(updatePromises)

    res.json({
      success: true,
      message: 'Banners reordered successfully'
    })
  } catch (error) {
    console.error('Error reordering banners:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to reorder banners'
    })
  }
})

export default router
