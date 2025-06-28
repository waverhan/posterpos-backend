import express from 'express'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createCategory, createProduct, createBranch, updateInventory, prisma } from '../services/database.js'
import { imageService } from '../services/imageService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

const POSTER_API_BASE = 'https://joinposter.com/api'
const POSTER_TOKEN = '218047:05891220e474bad7f26b6eaa0be3f344'

// POST /api/sync/full - Full sync from Poster API
router.post('/full', async (req, res) => {
  try {
    

    // 1. Sync branches from warehouses/storages
    
    const branchesResponse = await axios.get(`${POSTER_API_BASE}/storage.getStorages`, {
      params: { token: POSTER_TOKEN }
    })

    const posterBranches = branchesResponse.data.response || []
    const syncedBranches = []

    for (const storage of posterBranches) {
      const branchData = {
        poster_id: storage.storage_id,
        name: storage.storage_name || `Warehouse ${storage.storage_id}`,
        address: `Warehouse Location ${storage.storage_id}`, // Can be configured manually in admin
        phone: '+38 (097) 324 46 68', // Default phone from user requirements
        latitude: 50.4501, // Default Kyiv coordinates - can be configured per warehouse
        longitude: 30.5234,
        delivery_available: true,
        pickup_available: true,
        is_active: true
      }

      // Upsert branch - don't set id, let database auto-generate
      const branch = await prisma.branch.upsert({
        where: { poster_id: branchData.poster_id },
        update: {
          name: branchData.name,
          address: branchData.address,
          phone: branchData.phone,
          latitude: branchData.latitude,
          longitude: branchData.longitude,
          delivery_available: branchData.delivery_available,
          pickup_available: branchData.pickup_available,
          is_active: branchData.is_active
        },
        create: branchData
      })
      syncedBranches.push(branch)
    }

    // 2. Sync categories
    
    const categoriesResponse = await axios.get(`${POSTER_API_BASE}/menu.getCategories`, {
      params: { token: POSTER_TOKEN }
    })

    const posterCategories = categoriesResponse.data.response || []
    const syncedCategories = []

    for (const posterCat of posterCategories) {
      const categoryData = {
        poster_category_id: posterCat.category_id,
        name: posterCat.category_name,
        display_name: posterCat.category_name,
        description: '',
        image_url: '',
        sort_order: parseInt(posterCat.sort) || 0,
        is_active: posterCat.category_hidden !== '1'
      }

      // Upsert category - use poster_category_id as unique identifier
      const category = await prisma.category.upsert({
        where: { poster_category_id: categoryData.poster_category_id },
        update: {
          name: categoryData.name,
          display_name: categoryData.display_name,
          description: categoryData.description,
          image_url: categoryData.image_url,
          sort_order: categoryData.sort_order,
          is_active: categoryData.is_active
        },
        create: categoryData
      })
      syncedCategories.push(category)
    }

    // 3. Sync products - get all products at once
    
    const allProducts = []

    // Get all products from Poster API without category filtering
    const productsResponse = await axios.get(`${POSTER_API_BASE}/menu.getProducts`, {
      params: {
        token: POSTER_TOKEN
      }
    })

    const posterProducts = productsResponse.data.response || []
    

    for (const posterProduct of posterProducts) {
      // Debug: Log every product being processed
      if (posterProduct.product_id === '267' || posterProduct.product_id === '411' || posterProduct.product_id === '13') {
        
      }

      // Find the category for this product using menu_category_id
      const category = syncedCategories.find(cat => cat.poster_category_id === posterProduct.menu_category_id)
      if (!category) {
        
        continue
      }

      // Fix price parsing - Poster API returns prices as object {"1": "15500", "2": "15500", ...}
      let price = 0
      if (posterProduct.price) {
        if (typeof posterProduct.price === 'object') {
          // Get the first price level (usually "1")
          const firstPriceKey = Object.keys(posterProduct.price)[0]
          price = parseFloat(posterProduct.price[firstPriceKey] || 0)
        } else {
          price = parseFloat(posterProduct.price || 0)
        }
      }

      // Convert from kopecks to UAH (divide by 100)
      const priceInUAH = price / 100

      // Get the actual image URL from Poster API response
      let posterImageUrl = ''
      if (posterProduct.photo && posterProduct.photo !== '0') {
        // Use the actual photo URL from the API response
        if (posterProduct.photo_origin) {
          posterImageUrl = `https://joinposter.com${posterProduct.photo_origin}`
        } else if (posterProduct.photo) {
          posterImageUrl = `https://joinposter.com${posterProduct.photo}`
        }
      }

      // Process product image - find correct URL and download locally
      
      const localImagePath = await imageService.processProductImage(
        posterProduct.product_id,
        !!(posterProduct.photo && posterProduct.photo !== '0'),
        posterImageUrl
      )

      // Check if this is a weight-based product or beverage with kg unit
      const productName = (posterProduct.product_name || '').toLowerCase()
      const isBeverage = productName.includes('пиво') || productName.includes('вино') || productName.includes('сидр') ||
                        productName.includes('beer') || productName.includes('wine') || productName.includes('cocktail') ||
                        productName.includes('коктейль') || productName.includes('напій') || productName.includes('drink') ||
                        productName.includes('лимонад') || productName.includes('квас') || productName.includes('сік') ||
                        productName.includes('juice') || productName.includes('water') || productName.includes('вода') ||
                        productName.includes('tea') || productName.includes('чай') || productName.includes('coffee') ||
                        productName.includes('кава')

      const isWeightBased = posterProduct.ingredient_unit === 'kg' && !isBeverage
      const isBeverageWithKgUnit = posterProduct.ingredient_unit === 'kg' && isBeverage
      let adjustedPrice = isNaN(priceInUAH) ? 0 : priceInUAH

      // For weight-based products, divide price by 10 (convert from per-100g to per-kg storage)
      if (isWeightBased) {
        adjustedPrice = adjustedPrice / 10
      }

      // For beverages with kg unit, store the price as-is (it's already per-100g in Poster, will be converted for display)
      if (isBeverageWithKgUnit) {
        // Price already correct for beverages
      }

      // Store Poster API attributes including ingredient_unit
      const attributes = {
        ingredient_unit: posterProduct.ingredient_unit || 'pcs',
        ingredient_id: posterProduct.ingredient_id,
        out: posterProduct.out,
        photo: posterProduct.photo,
        photo_origin: posterProduct.photo_origin
      }

      const productData = {
        poster_product_id: posterProduct.product_id,
        ingredient_id: posterProduct.ingredient_id || null,
        category_id: category.id,
        name: posterProduct.product_name,
        display_name: posterProduct.product_name,
        description: posterProduct.ingredients || '',
        price: adjustedPrice,
        original_price: adjustedPrice,
        image_url: localImagePath || posterImageUrl || '',
        display_image_url: localImagePath || posterImageUrl || '',
        is_active: posterProduct.out !== '1',
        attributes: attributes,
        custom_quantity: isWeightBased ? 0.05 : (isBeverageWithKgUnit ? 0.5 : null), // 50g for weight-based, 0.5L for beverages
        custom_unit: isWeightBased ? 'г' : (isBeverageWithKgUnit ? 'л' : null),
        quantity_step: (isWeightBased || isBeverageWithKgUnit) ? 1 : null
      }

      // Debug logging for ingredient_id - specific products
      if (posterProduct.product_id === '267' || posterProduct.product_id === '397' || posterProduct.product_id === '13') {
        console.log(`Debug product ${posterProduct.product_id}: ingredient_id=${posterProduct.ingredient_id}`)
      }

      // Upsert product
      const product = await prisma.product.upsert({
        where: { poster_product_id: productData.poster_product_id },
        update: {
          ingredient_id: productData.ingredient_id,
          category_id: productData.category_id,
          name: productData.name,
          display_name: productData.display_name,
          description: productData.description,
          price: productData.price,
          original_price: productData.original_price,
          image_url: productData.image_url,
          display_image_url: productData.display_image_url,
          is_active: productData.is_active
        },
        create: {
          poster_product_id: productData.poster_product_id,
          ingredient_id: productData.ingredient_id,
          name: productData.name,
          display_name: productData.display_name,
          description: productData.description,
          price: productData.price,
          original_price: productData.original_price,
          image_url: productData.image_url,
          display_image_url: productData.display_image_url,
          is_active: productData.is_active,
          category: {
            connect: { id: productData.category_id }
          }
        }
      })

      // Debug logging after database save
      if (posterProduct.product_id === '267' || posterProduct.product_id === '397' || posterProduct.product_id === '13') {
        console.log(`Product ${posterProduct.product_id} saved to database with ingredient_id: ${product.ingredient_id}`)
      }

      allProducts.push(product)
    }

    // 4. Sync inventory for each branch
    
    let totalInventoryRecords = 0

    for (const branch of syncedBranches) {
      try {
        const inventoryResponse = await axios.get(`${POSTER_API_BASE}/storage.getStorageLeftovers`, {
          params: {
            token: POSTER_TOKEN,
            storage_id: branch.poster_id
          }
        })

        const inventoryData = inventoryResponse.data.response || []
        

        // Debug: Log sample inventory item to verify field names
        if (inventoryData.length > 0) {
          console.log(`Sample inventory for ${branch.name}:`, inventoryData.slice(0, 3))
        }

        // Create inventory map
        const inventoryMap = new Map()
        inventoryData.forEach(item => {
          if (item.ingredient_id) {
            inventoryMap.set(item.ingredient_id, {
              quantity: parseFloat(item.storage_ingredient_left) || 0,
              unit: item.ingredient_unit || 'pcs'
            })
          }
        })

        // Update inventory for each product
        for (const product of allProducts) {
          // Use ingredient_id to match with inventory data
          const inventory = inventoryMap.get(product.ingredient_id)

          if (inventory) {
            await updateInventory(
              product.id,
              branch.id,
              inventory.quantity,
              inventory.unit
            )
            totalInventoryRecords++
          } else {
            // Product not available at this branch
            await updateInventory(
              product.id,
              branch.id,
              0,
              'pcs'
            )
          }
        }

      } catch (error) {
        console.error(`❌ Failed to sync inventory for branch ${branch.name}:`, error.message)
      }
    }

    const result = {
      success: true,
      message: 'Full sync completed successfully',
      stats: {
        branches: syncedBranches.length,
        categories: syncedCategories.length,
        products: allProducts.length,
        inventory_records: totalInventoryRecords
      }
    }

    
    res.json(result)

  } catch (error) {
    console.error('❌ Full sync failed:', error)
    res.status(500).json({
      success: false,
      error: 'Full sync failed',
      message: error.message
    })
  }
})

// POST /api/sync/inventory - Quick inventory sync
router.post('/inventory', async (req, res) => {
  try {
    
    

    const branches = await prisma.branch.findMany({ where: { is_active: true } })
    const products = await prisma.product.findMany({ where: { is_active: true } })

    let totalInventoryRecords = 0

    for (const branch of branches) {
      try {
        const inventoryResponse = await axios.get(`${POSTER_API_BASE}/storage.getStorageLeftovers`, {
          params: {
            token: POSTER_TOKEN,
            storage_id: branch.poster_id
          }
        })

        const inventoryData = inventoryResponse.data.response || []
        

        // Debug: Log sample inventory item to verify field names
        if (inventoryData.length > 0) {
          console.log(`Sample inventory for ${branch.name}:`, inventoryData.slice(0, 3))
        }

        // Create inventory map
        const inventoryMap = new Map()
        let sampleProcessed = false
        inventoryData.forEach(item => {
          if (item.ingredient_id) {
            const quantity = parseFloat(item.storage_ingredient_left) || 0
            inventoryMap.set(item.ingredient_id, {
              quantity: quantity,
              unit: item.ingredient_unit || 'pcs'
            })

            // Log first processed item for debugging
            if (!sampleProcessed) {
              console.log(`Sample inventory item: ${item.ingredient_name} - ${quantity} ${item.ingredient_unit}`)
              sampleProcessed = true
            }
          }
        })

        // Update inventory for each product
        for (const product of products) {
          // Use ingredient_id to match with inventory data
          const inventory = inventoryMap.get(product.ingredient_id)

          if (inventory) {
            await updateInventory(
              product.id,
              branch.id,
              inventory.quantity,
              inventory.unit
            )
            totalInventoryRecords++
          }
        }

      } catch (error) {
        console.error(`❌ Failed to sync inventory for branch ${branch.name}:`, error.message)
      }
    }

    const result = {
      success: true,
      message: 'Inventory sync completed successfully',
      stats: {
        branches: branches.length,
        products: products.length,
        inventory_records: totalInventoryRecords
      }
    }

    
    res.json(result)

  } catch (error) {
    console.error('❌ Inventory sync failed:', error)
    res.status(500).json({
      success: false,
      error: 'Inventory sync failed',
      message: error.message
    })
  }
})

// POST /api/sync/images - Sync images for existing products
router.post('/images', async (req, res) => {
  try {
    

    // Get all products from database
    const products = await prisma.product.findMany({
      where: { is_active: true }
    })

    

    // Process images in batches
    const imageResults = await imageService.processProductImages(
      products.map(p => ({
        poster_product_id: p.poster_product_id,
        hasPhoto: true, // Assume all products might have photos
        image_url: p.image_url
      }))
    )

    // Update products with new local image paths
    let updatedCount = 0
    for (const result of imageResults) {
      if (result && result.localImagePath) {
        await prisma.product.updateMany({
          where: { poster_product_id: result.productId },
          data: {
            image_url: result.localImagePath,
            display_image_url: result.localImagePath
          }
        })
        updatedCount++
      }
    }

    const result = {
      success: true,
      message: 'Image sync completed successfully',
      stats: {
        total_products: products.length,
        images_processed: imageResults.filter(r => r && r.localImagePath).length,
        products_updated: updatedCount
      }
    }

    
    res.json(result)

  } catch (error) {
    console.error('❌ Image sync failed:', error)
    res.status(500).json({
      success: false,
      error: 'Image sync failed',
      message: error.message
    })
  }
})

// POST /api/sync/fix-images - Fix broken local image URLs
router.post('/fix-images', async (req, res) => {
  try {
    

    // Get all products with local image URLs
    const products = await prisma.product.findMany({
      where: {
        is_active: true,
        OR: [
          { image_url: { startsWith: '/images/products/' } },
          { display_image_url: { startsWith: '/images/products/' } }
        ]
      }
    })

    

    let fixedCount = 0

    for (const product of products) {
      let needsUpdate = false
      const updateData = {}

      // Check if local image files exist
      const imageUrl = product.image_url
      const displayImageUrl = product.display_image_url

      if (imageUrl && imageUrl.startsWith('/images/products/')) {
        const imagePath = path.join(__dirname, '../public', imageUrl)
        if (!fs.existsSync(imagePath)) {
          // Local image doesn't exist, revert to Poster URL
          const posterUrl = await imageService.findCorrectImageUrl(product.poster_product_id, true)
          updateData.image_url = posterUrl || ''
          needsUpdate = true
          
        }
      }

      if (displayImageUrl && displayImageUrl.startsWith('/images/products/')) {
        const imagePath = path.join(__dirname, '../public', displayImageUrl)
        if (!fs.existsSync(imagePath)) {
          // Local image doesn't exist, revert to Poster URL
          const posterUrl = await imageService.findCorrectImageUrl(product.poster_product_id, true)
          updateData.display_image_url = posterUrl || ''
          needsUpdate = true
          
        }
      }

      if (needsUpdate) {
        await prisma.product.update({
          where: { id: product.id },
          data: updateData
        })
        fixedCount++
      }
    }

    const result = {
      success: true,
      message: 'Image URLs fixed successfully',
      stats: {
        total_products: products.length,
        fixed_products: fixedCount
      }
    }

    
    res.json(result)

  } catch (error) {
    console.error('❌ Image URL fix failed:', error)
    res.status(500).json({
      success: false,
      error: 'Image URL fix failed',
      message: error.message
    })
  }
})

// POST /api/sync/download-images - Download all product images from Poster API and store locally
router.post('/download-images', async (req, res) => {
  try {
    

    // Get all categories to fetch products by category
    const categories = await prisma.category.findMany({ where: { is_active: true } })
    

    let downloadedCount = 0
    let updatedCount = 0
    let totalProducts = 0

    for (const category of categories) {
      try {
        const productsResponse = await axios.get(`${POSTER_API_BASE}/menu.getProducts`, {
          params: {
            token: POSTER_TOKEN,
            category_id: category.poster_category_id,
            type: 'products'
          }
        })

        const posterProducts = productsResponse.data.response || []
        totalProducts += posterProducts.length

        for (const posterProduct of posterProducts) {
          // Get the actual image URL from Poster API response
          let posterImageUrl = ''
          if (posterProduct.photo && posterProduct.photo !== '0') {
            // Use the actual photo URL from the API response
            if (posterProduct.photo_origin) {
              posterImageUrl = `https://joinposter.com${posterProduct.photo_origin}`
            } else if (posterProduct.photo) {
              posterImageUrl = `https://joinposter.com${posterProduct.photo}`
            }
          }

          // Download and process the image
          if (posterImageUrl) {
            const localImagePath = await imageService.processProductImage(
              posterProduct.product_id,
              true,
              posterImageUrl
            )

            if (localImagePath) {
              downloadedCount++

              // Update the product with local image path
              const updateResult = await prisma.product.updateMany({
                where: { poster_product_id: posterProduct.product_id },
                data: {
                  image_url: localImagePath,
                  display_image_url: localImagePath
                }
              })

              if (updateResult.count > 0) {
                updatedCount++
                
              }
            }
          }
        }

      } catch (error) {
        console.error(`❌ Failed to download images for category ${category.name}:`, error.message)
      }
    }

    const result = {
      success: true,
      message: 'Product images downloaded successfully',
      stats: {
        total_products: totalProducts,
        downloaded_images: downloadedCount,
        updated_products: updatedCount
      }
    }

    
    res.json(result)

  } catch (error) {
    console.error('❌ Image download failed:', error)
    res.status(500).json({
      success: false,
      error: 'Image download failed',
      message: error.message
    })
  }
})

// POST /api/sync/fix-images-from-api - Fix product images using actual API URLs
router.post('/fix-images-from-api', async (req, res) => {
  try {
    

    // Get all categories to fetch products by category
    const categories = await prisma.category.findMany({ where: { is_active: true } })
    

    let updatedCount = 0
    let totalProducts = 0

    for (const category of categories) {
      try {
        const productsResponse = await axios.get(`${POSTER_API_BASE}/menu.getProducts`, {
          params: {
            token: POSTER_TOKEN,
            category_id: category.poster_category_id,
            type: 'products'
          }
        })

        const posterProducts = productsResponse.data.response || []
        totalProducts += posterProducts.length

        for (const posterProduct of posterProducts) {
          // Get the actual image URL from Poster API response
          let imageUrl = ''
          if (posterProduct.photo && posterProduct.photo !== '0') {
            // Use the actual photo URL from the API response
            if (posterProduct.photo_origin) {
              imageUrl = `https://joinposter.com${posterProduct.photo_origin}`
            } else if (posterProduct.photo) {
              imageUrl = `https://joinposter.com${posterProduct.photo}`
            }
          }

          // Update the product image URL in database
          if (imageUrl) {
            const updateResult = await prisma.product.updateMany({
              where: { poster_product_id: posterProduct.product_id },
              data: {
                image_url: imageUrl,
                display_image_url: imageUrl
              }
            })

            if (updateResult.count > 0) {
              updatedCount++
              
            }
          }
        }

      } catch (error) {
        console.error(`❌ Failed to fix images for category ${category.name}:`, error.message)
      }
    }

    const result = {
      success: true,
      message: 'Product images fixed successfully',
      stats: {
        total_products: totalProducts,
        updated_products: updatedCount
      }
    }

    
    res.json(result)

  } catch (error) {
    console.error('❌ Image fix failed:', error)
    res.status(500).json({
      success: false,
      error: 'Image fix failed',
      message: error.message
    })
  }
})

// POST /api/sync/fix-prices - Fix product prices from Poster API
router.post('/fix-prices', async (req, res) => {
  try {
    

    // Get all categories to fetch products by category
    const categories = await prisma.category.findMany({ where: { is_active: true } })
    

    let updatedCount = 0
    let totalProducts = 0

    for (const category of categories) {
      try {
        const productsResponse = await axios.get(`${POSTER_API_BASE}/menu.getProducts`, {
          params: {
            token: POSTER_TOKEN,
            category_id: category.poster_category_id,
            type: 'products'
          }
        })

        const posterProducts = productsResponse.data.response || []
        totalProducts += posterProducts.length

        for (const posterProduct of posterProducts) {
          // Fix price parsing - Poster API returns prices as object {"1": "15500", "2": "15500", ...}
          let price = 0
          if (posterProduct.price) {
            if (typeof posterProduct.price === 'object') {
              // Get the first price level (usually "1")
              const firstPriceKey = Object.keys(posterProduct.price)[0]
              price = parseFloat(posterProduct.price[firstPriceKey] || 0)
            } else {
              price = parseFloat(posterProduct.price || 0)
            }
          }

          // Convert from kopecks to UAH (divide by 100)
          const priceInUAH = price / 100

          // Update the product price in database
          const updateResult = await prisma.product.updateMany({
            where: { poster_product_id: posterProduct.product_id },
            data: {
              price: isNaN(priceInUAH) ? 0 : priceInUAH,
              original_price: isNaN(priceInUAH) ? 0 : priceInUAH
            }
          })

          if (updateResult.count > 0) {
            updatedCount++
            
          }
        }

      } catch (error) {
        console.error(`❌ Failed to fix prices for category ${category.name}:`, error.message)
      }
    }

    const result = {
      success: true,
      message: 'Product prices fixed successfully',
      stats: {
        total_products: totalProducts,
        updated_products: updatedCount
      }
    }

    
    res.json(result)

  } catch (error) {
    console.error('❌ Price fix failed:', error)
    res.status(500).json({
      success: false,
      error: 'Price fix failed',
      message: error.message
    })
  }
})

export default router
