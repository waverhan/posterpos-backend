import express from 'express'
import { PrismaClient } from '@prisma/client'

const router = express.Router()

// Initialize Prisma client with error handling
let prisma
try {
  prisma = new PrismaClient()
} catch (error) {
  console.error('Failed to initialize Prisma client for analytics:', error.message)
  prisma = null
}

// Track analytics event
router.post('/event', async (req, res) => {
  try {
    // Check if Prisma is available
    if (!prisma) {
      console.log('Analytics disabled: Prisma not available')
      return res.json({ success: true, message: 'Analytics disabled' })
    }

    const {
      event,
      category,
      action,
      label,
      value,
      custom_parameters,
      session_id,
      user_id,
      timestamp,
      url,
      referrer
    } = req.body

    // Store analytics event
    const analyticsEvent = await prisma.analyticsEvent.create({
      data: {
        event_name: event,
        category,
        action,
        label,
        value: value || null,
        custom_parameters: custom_parameters || {},
        session_id,
        user_id,
        timestamp: new Date(timestamp || Date.now()),
        url,
        referrer,
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      }
    })

    res.json({ success: true, event_id: analyticsEvent.id })
  } catch (error) {
    console.error('Analytics event error:', error)
    res.status(500).json({ error: 'Failed to track event' })
  }
})

// Track user session
router.post('/session', async (req, res) => {
  try {
    const {
      session_id,
      user_id,
      start_time,
      end_time,
      duration,
      page_views,
      events,
      device_info
    } = req.body

    // Store session data
    const session = await prisma.analyticsSession.create({
      data: {
        session_id,
        user_id,
        start_time: new Date(start_time),
        end_time: new Date(end_time),
        duration,
        page_views,
        events_count: events?.length || 0,
        device_info: device_info || {},
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      }
    })

    res.json({ success: true, session_db_id: session.id })
  } catch (error) {
    console.error('Session tracking error:', error)
    res.status(500).json({ error: 'Failed to track session' })
  }
})

// Get analytics dashboard data (admin only)
router.get('/dashboard', async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query
    
    // Calculate date range
    const now = new Date()
    let startDate = new Date()
    
    switch (timeframe) {
      case '1d':
        startDate.setDate(now.getDate() - 1)
        break
      case '7d':
        startDate.setDate(now.getDate() - 7)
        break
      case '30d':
        startDate.setDate(now.getDate() - 30)
        break
      case '90d':
        startDate.setDate(now.getDate() - 90)
        break
      default:
        startDate.setDate(now.getDate() - 7)
    }

    // Get analytics data
    const [
      totalEvents,
      totalSessions,
      uniqueUsers,
      topEvents,
      topPages,
      deviceStats,
      conversionData
    ] = await Promise.all([
      // Total events
      prisma.analyticsEvent.count({
        where: {
          timestamp: { gte: startDate }
        }
      }),

      // Total sessions
      prisma.analyticsSession.count({
        where: {
          start_time: { gte: startDate }
        }
      }),

      // Unique users
      prisma.analyticsSession.groupBy({
        by: ['user_id'],
        where: {
          start_time: { gte: startDate },
          user_id: { not: null }
        }
      }).then(result => result.length),

      // Top events
      prisma.analyticsEvent.groupBy({
        by: ['event_name'],
        _count: { event_name: true },
        where: {
          timestamp: { gte: startDate }
        },
        orderBy: {
          _count: { event_name: 'desc' }
        },
        take: 10
      }),

      // Top pages
      prisma.analyticsEvent.groupBy({
        by: ['url'],
        _count: { url: true },
        where: {
          timestamp: { gte: startDate },
          event_name: 'page_view'
        },
        orderBy: {
          _count: { url: 'desc' }
        },
        take: 10
      }),

      // Device stats
      prisma.analyticsSession.findMany({
        where: {
          start_time: { gte: startDate }
        },
        select: {
          device_info: true
        }
      }),

      // Conversion data (add to cart -> purchase)
      Promise.all([
        prisma.analyticsEvent.count({
          where: {
            timestamp: { gte: startDate },
            event_name: 'add_to_cart'
          }
        }),
        prisma.analyticsEvent.count({
          where: {
            timestamp: { gte: startDate },
            event_name: 'purchase'
          }
        })
      ])
    ])

    // Process device stats
    const deviceBreakdown = deviceStats.reduce((acc, session) => {
      const deviceInfo = session.device_info
      if (deviceInfo && deviceInfo.user_agent) {
        const isMobile = /Mobile|Android|iPhone|iPad/.test(deviceInfo.user_agent)
        const deviceType = isMobile ? 'mobile' : 'desktop'
        acc[deviceType] = (acc[deviceType] || 0) + 1
      }
      return acc
    }, {})

    // Calculate conversion rate
    const [addToCartCount, purchaseCount] = conversionData
    const conversionRate = addToCartCount > 0 ? (purchaseCount / addToCartCount) * 100 : 0

    res.json({
      success: true,
      data: {
        overview: {
          total_events: totalEvents,
          total_sessions: totalSessions,
          unique_users: uniqueUsers,
          conversion_rate: Math.round(conversionRate * 100) / 100
        },
        top_events: topEvents.map(event => ({
          event_name: event.event_name,
          count: event._count.event_name
        })),
        top_pages: topPages.map(page => ({
          url: page.url,
          views: page._count.url
        })),
        device_breakdown: deviceBreakdown,
        timeframe,
        date_range: {
          start: startDate.toISOString(),
          end: now.toISOString()
        }
      }
    })
  } catch (error) {
    console.error('Analytics dashboard error:', error)
    res.status(500).json({ error: 'Failed to get analytics data' })
  }
})

// Get real-time analytics
router.get('/realtime', async (req, res) => {
  try {
    const last30Minutes = new Date(Date.now() - 30 * 60 * 1000)

    const [activeUsers, recentEvents, currentPageViews] = await Promise.all([
      // Active users in last 30 minutes
      prisma.analyticsEvent.groupBy({
        by: ['session_id'],
        where: {
          timestamp: { gte: last30Minutes }
        }
      }).then(result => result.length),

      // Recent events
      prisma.analyticsEvent.findMany({
        where: {
          timestamp: { gte: last30Minutes }
        },
        orderBy: {
          timestamp: 'desc'
        },
        take: 20,
        select: {
          event_name: true,
          action: true,
          url: true,
          timestamp: true,
          session_id: true
        }
      }),

      // Current page views
      prisma.analyticsEvent.groupBy({
        by: ['url'],
        _count: { url: true },
        where: {
          timestamp: { gte: last30Minutes },
          event_name: 'page_view'
        },
        orderBy: {
          _count: { url: 'desc' }
        },
        take: 5
      })
    ])

    res.json({
      success: true,
      data: {
        active_users: activeUsers,
        recent_events: recentEvents,
        current_page_views: currentPageViews.map(page => ({
          url: page.url,
          views: page._count.url
        }))
      }
    })
  } catch (error) {
    console.error('Real-time analytics error:', error)
    res.status(500).json({ error: 'Failed to get real-time data' })
  }
})

// Get e-commerce analytics
router.get('/ecommerce', async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query
    
    const now = new Date()
    let startDate = new Date()
    
    switch (timeframe) {
      case '1d':
        startDate.setDate(now.getDate() - 1)
        break
      case '7d':
        startDate.setDate(now.getDate() - 7)
        break
      case '30d':
        startDate.setDate(now.getDate() - 30)
        break
      default:
        startDate.setDate(now.getDate() - 7)
    }

    const [
      totalRevenue,
      totalOrders,
      averageOrderValue,
      topProducts,
      conversionFunnel
    ] = await Promise.all([
      // Total revenue from purchase events
      prisma.analyticsEvent.aggregate({
        _sum: { value: true },
        where: {
          timestamp: { gte: startDate },
          event_name: 'purchase'
        }
      }),

      // Total orders
      prisma.analyticsEvent.count({
        where: {
          timestamp: { gte: startDate },
          event_name: 'purchase'
        }
      }),

      // Average order value
      prisma.analyticsEvent.aggregate({
        _avg: { value: true },
        where: {
          timestamp: { gte: startDate },
          event_name: 'purchase'
        }
      }),

      // Top products (from add_to_cart events)
      prisma.analyticsEvent.findMany({
        where: {
          timestamp: { gte: startDate },
          event_name: 'add_to_cart'
        },
        select: {
          custom_parameters: true
        }
      }),

      // Conversion funnel
      Promise.all([
        prisma.analyticsEvent.count({
          where: {
            timestamp: { gte: startDate },
            event_name: 'page_view',
            url: { contains: '/shop' }
          }
        }),
        prisma.analyticsEvent.count({
          where: {
            timestamp: { gte: startDate },
            event_name: 'add_to_cart'
          }
        }),
        prisma.analyticsEvent.count({
          where: {
            timestamp: { gte: startDate },
            event_name: 'purchase'
          }
        })
      ])
    ])

    // Process top products
    const productCounts = topProducts.reduce((acc, event) => {
      const params = event.custom_parameters
      if (params && params.item_name) {
        acc[params.item_name] = (acc[params.item_name] || 0) + (params.quantity || 1)
      }
      return acc
    }, {})

    const topProductsList = Object.entries(productCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ product_name: name, add_to_cart_count: count }))

    const [shopViews, addToCarts, purchases] = conversionFunnel

    res.json({
      success: true,
      data: {
        revenue: {
          total: totalRevenue._sum.value || 0,
          average_order_value: averageOrderValue._avg.value || 0,
          total_orders: totalOrders
        },
        top_products: topProductsList,
        conversion_funnel: {
          shop_views: shopViews,
          add_to_cart: addToCarts,
          purchases: purchases,
          view_to_cart_rate: shopViews > 0 ? (addToCarts / shopViews) * 100 : 0,
          cart_to_purchase_rate: addToCarts > 0 ? (purchases / addToCarts) * 100 : 0
        },
        timeframe
      }
    })
  } catch (error) {
    console.error('E-commerce analytics error:', error)
    res.status(500).json({ error: 'Failed to get e-commerce analytics' })
  }
})

export default router
