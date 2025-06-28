import express from 'express'
import { viberService } from '../services/viberService.js'

const router = express.Router()

// POST /api/messaging/viber/test - Test Viber message
router.post('/viber/test', async (req, res) => {
  try {
    const { phone, message } = req.body

    if (!phone || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number and message are required' 
      })
    }

    

    const result = await viberService.sendMessage(phone, message)

    if (result.success) {
      
      res.json({
        success: true,
        message: 'Viber message sent successfully',
        data: result.data
      })
    } else {
      
      res.status(400).json({
        success: false,
        error: result.error
      })
    }

  } catch (error) {
    console.error('❌ Error testing Viber message:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

// POST /api/messaging/viber/order-notification - Send order notification via Viber
router.post('/viber/order-notification', async (req, res) => {
  try {
    const { order } = req.body

    if (!order) {
      return res.status(400).json({ 
        success: false, 
        error: 'Order data is required' 
      })
    }

    

    const result = await viberService.sendOrderConfirmation(order)

    if (result.success) {
      
      res.json({
        success: true,
        message: 'Viber order notification sent successfully',
        data: result.data
      })
    } else {
      
      res.status(400).json({
        success: false,
        error: result.error
      })
    }

  } catch (error) {
    console.error('❌ Error sending Viber order notification:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

// GET /api/messaging/viber/status - Check Viber bot status
router.get('/viber/status', async (req, res) => {
  try {
    const hasToken = !!process.env.VIBER_BOT_TOKEN
    
    res.json({
      configured: hasToken,
      message: hasToken 
        ? 'Viber bot is configured and ready' 
        : 'Viber bot token not configured. Set VIBER_BOT_TOKEN environment variable.'
    })

  } catch (error) {
    console.error('❌ Error checking Viber status:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

export default router
