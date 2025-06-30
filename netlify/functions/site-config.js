// Simple site-config endpoint that returns mock data for now
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    }
  }

  try {
    // Return mock site config data
    const config = {
      site_name: 'PosterPOS Shop',
      site_description: 'Modern PWA Shop with real-time inventory',
      contact_email: 'info@posterpos.com',
      contact_phone: '+380123456789',
      delivery_enabled: true,
      pickup_enabled: true,
      min_order_amount: 100,
      currency: 'UAH',
      timezone: 'Europe/Kiev'
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        config: config
      })
    }
  } catch (error) {
    console.error('Site config error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Failed to fetch site config',
        message: error.message 
      })
    }
  }
}
