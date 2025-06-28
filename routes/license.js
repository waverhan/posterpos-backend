import express from 'express'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const router = express.Router()
const prisma = new PrismaClient()

// Generate license key
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const segments = []
  
  for (let i = 0; i < 4; i++) {
    let segment = ''
    for (let j = 0; j < 4; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    segments.push(segment)
  }
  
  return segments.join('-')
}

// Calculate expiration date
function getExpirationDate(plan) {
  const now = new Date()
  if (plan === 'yearly') {
    return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
  } else {
    return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
  }
}

// POST /api/license/validate - Validate license for current domain
router.post('/validate', async (req, res) => {
  try {
    const { domain } = req.body
    
    if (!domain) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Domain is required' 
      })
    }

    // For development, allow localhost
    if (domain === 'localhost' || domain === '127.0.0.1') {
      return res.json({
        valid: true,
        license: {
          id: 'dev-license',
          domain: domain,
          license_key: 'DEV-MODE-ACTIVE',
          plan: 'yearly',
          status: 'active',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          features: ['all']
        },
        days_remaining: 365
      })
    }

    // Check if license exists for this domain
    const license = await prisma.license.findFirst({
      where: { 
        domain: domain,
        status: 'active'
      }
    })

    if (!license) {
      return res.json({ 
        valid: false, 
        error: 'No active license found for this domain' 
      })
    }

    // Check if license is expired
    const now = new Date()
    const expiresAt = new Date(license.expires_at)
    
    if (now > expiresAt) {
      // Update license status to expired
      await prisma.license.update({
        where: { id: license.id },
        data: { status: 'expired' }
      })
      
      return res.json({ 
        valid: false, 
        error: 'License has expired' 
      })
    }

    // Calculate days remaining
    const diffTime = expiresAt.getTime() - now.getTime()
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    res.json({
      valid: true,
      license: {
        id: license.id,
        domain: license.domain,
        license_key: license.license_key,
        plan: license.plan,
        status: license.status,
        created_at: license.created_at.toISOString(),
        expires_at: license.expires_at.toISOString(),
        features: JSON.parse(license.features || '["all"]')
      },
      days_remaining: daysRemaining
    })

  } catch (error) {
    console.error('License validation error:', error)
    res.status(500).json({ 
      valid: false, 
      error: 'Internal server error' 
    })
  }
})

// POST /api/license/activate - Activate license key for domain
router.post('/activate', async (req, res) => {
  try {
    const { license_key, domain } = req.body
    
    if (!license_key || !domain) {
      return res.status(400).json({ 
        valid: false, 
        error: 'License key and domain are required' 
      })
    }

    // Find license by key
    const license = await prisma.license.findFirst({
      where: { license_key }
    })

    if (!license) {
      return res.status(404).json({ 
        valid: false, 
        error: 'Invalid license key' 
      })
    }

    // Check if license is already activated for another domain
    if (license.domain && license.domain !== domain) {
      return res.status(400).json({ 
        valid: false, 
        error: 'License key is already activated for another domain' 
      })
    }

    // Check if license is expired
    const now = new Date()
    const expiresAt = new Date(license.expires_at)
    
    if (now > expiresAt) {
      return res.status(400).json({ 
        valid: false, 
        error: 'License key has expired' 
      })
    }

    // Activate license for this domain
    const updatedLicense = await prisma.license.update({
      where: { id: license.id },
      data: { 
        domain: domain,
        status: 'active'
      }
    })

    // Calculate days remaining
    const diffTime = expiresAt.getTime() - now.getTime()
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    res.json({
      valid: true,
      license: {
        id: updatedLicense.id,
        domain: updatedLicense.domain,
        license_key: updatedLicense.license_key,
        plan: updatedLicense.plan,
        status: updatedLicense.status,
        created_at: updatedLicense.created_at.toISOString(),
        expires_at: updatedLicense.expires_at.toISOString(),
        features: JSON.parse(updatedLicense.features || '["all"]')
      },
      days_remaining: daysRemaining
    })

  } catch (error) {
    console.error('License activation error:', error)
    res.status(500).json({ 
      valid: false, 
      error: 'Internal server error' 
    })
  }
})

// POST /api/license/create - Create new license (admin only)
router.post('/create', async (req, res) => {
  try {
    const { domain, plan, features } = req.body
    
    if (!domain || !plan) {
      return res.status(400).json({ 
        error: 'Domain and plan are required' 
      })
    }

    const licenseKey = generateLicenseKey()
    const expiresAt = getExpirationDate(plan)

    const license = await prisma.license.create({
      data: {
        license_key: licenseKey,
        domain: domain,
        plan: plan,
        status: 'active',
        expires_at: expiresAt,
        features: JSON.stringify(features || ['all'])
      }
    })

    res.status(201).json({
      id: license.id,
      domain: license.domain,
      license_key: license.license_key,
      plan: license.plan,
      status: license.status,
      created_at: license.created_at.toISOString(),
      expires_at: license.expires_at.toISOString(),
      features: JSON.parse(license.features)
    })

  } catch (error) {
    console.error('License creation error:', error)
    res.status(500).json({ 
      error: 'Internal server error' 
    })
  }
})

// GET /api/license/all - Get all licenses (admin only)
router.get('/all', async (req, res) => {
  try {
    const licenses = await prisma.license.findMany({
      orderBy: { created_at: 'desc' }
    })

    const formattedLicenses = licenses.map(license => ({
      id: license.id,
      domain: license.domain,
      license_key: license.license_key,
      plan: license.plan,
      status: license.status,
      created_at: license.created_at.toISOString(),
      expires_at: license.expires_at.toISOString(),
      features: JSON.parse(license.features || '["all"]')
    }))

    res.json(formattedLicenses)

  } catch (error) {
    console.error('Failed to fetch licenses:', error)
    res.status(500).json({ 
      error: 'Internal server error' 
    })
  }
})

// POST /api/license/:id/renew - Renew license
router.post('/:id/renew', async (req, res) => {
  try {
    const { id } = req.params
    const { plan } = req.body

    if (!plan) {
      return res.status(400).json({ 
        error: 'Plan is required' 
      })
    }

    const license = await prisma.license.findUnique({
      where: { id }
    })

    if (!license) {
      return res.status(404).json({ 
        error: 'License not found' 
      })
    }

    // Calculate new expiration date from current expiration or now (whichever is later)
    const now = new Date()
    const currentExpiration = new Date(license.expires_at)
    const startDate = currentExpiration > now ? currentExpiration : now
    
    let newExpirationDate
    if (plan === 'yearly') {
      newExpirationDate = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate())
    } else {
      newExpirationDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate())
    }

    const updatedLicense = await prisma.license.update({
      where: { id },
      data: {
        plan: plan,
        status: 'active',
        expires_at: newExpirationDate
      }
    })

    res.json({
      id: updatedLicense.id,
      domain: updatedLicense.domain,
      license_key: updatedLicense.license_key,
      plan: updatedLicense.plan,
      status: updatedLicense.status,
      created_at: updatedLicense.created_at.toISOString(),
      expires_at: updatedLicense.expires_at.toISOString(),
      features: JSON.parse(updatedLicense.features || '["all"]')
    })

  } catch (error) {
    console.error('License renewal error:', error)
    res.status(500).json({ 
      error: 'Internal server error' 
    })
  }
})

export default router
