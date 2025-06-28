import express from 'express'
import axios from 'axios'
import mysql from 'mysql2/promise'

const router = express.Router()

const POSTER_API_BASE = 'https://joinposter.com/api'
const POSTER_TOKEN = '218047:05891220e474bad7f26b6eaa0be3f344'

// Database configuration
const dbConfig = {
  host: 'avalon.cityhost.com.ua',
  port: 3306,
  user: 'ch6edd8920_pwapos',
  password: 'mA1ZDUY7fA',
  database: 'ch6edd8920_pwapos',
  charset: 'utf8mb4'
}

// Generate simple ID
function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

// POST /api/sync/full - Full sync from Poster API using direct MySQL
router.post('/full', async (req, res) => {
  let connection = null
  
  try {
    console.log('🔄 Starting full sync with MySQL database...')
    
    // Connect to database
    connection = await mysql.createConnection(dbConfig)
    console.log('✅ Connected to MySQL database')
    
    let syncResults = {
      categories: 0,
      products: 0,
      branches: 0,
      inventory: 0,
      errors: []
    }

    // 1. Sync Categories
    console.log('📂 Syncing categories...')
    try {
      const categoriesResponse = await axios.get(`${POSTER_API_BASE}/menu.getCategories`, {
        params: { token: POSTER_TOKEN },
        timeout: 30000
      })

      const posterCategories = categoriesResponse.data.response || []
      console.log(`   Found ${posterCategories.length} categories from Poster API`)

      for (const posterCat of posterCategories) {
        try {
          // Check if category exists
          const [existing] = await connection.execute(
            'SELECT id FROM categories WHERE poster_id = ?',
            [posterCat.category_id]
          )

          if (existing.length > 0) {
            // Update existing category
            await connection.execute(
              'UPDATE categories SET name = ?, description = ?, sort_order = ?, updated_at = NOW() WHERE poster_id = ?',
              [
                posterCat.category_name,
                `Category: ${posterCat.category_name}`,
                parseInt(posterCat.sort_order) || 0,
                posterCat.category_id
              ]
            )
          } else {
            // Create new category
            await connection.execute(
              'INSERT INTO categories (id, poster_id, name, description, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
              [
                generateId(),
                posterCat.category_id,
                posterCat.category_name,
                `Category: ${posterCat.category_name}`,
                parseInt(posterCat.sort_order) || 0,
                1
              ]
            )
          }
          syncResults.categories++
        } catch (error) {
          console.error(`   ❌ Failed to sync category ${posterCat.category_name}:`, error.message)
          syncResults.errors.push(`Category ${posterCat.category_name}: ${error.message}`)
        }
      }
      console.log(`   ✅ Synced ${syncResults.categories} categories`)
    } catch (error) {
      console.error('❌ Categories sync failed:', error.message)
      syncResults.errors.push(`Categories sync: ${error.message}`)
    }

    // 2. Sync Products
    console.log('🛍️  Syncing products...')
    try {
      const productsResponse = await axios.get(`${POSTER_API_BASE}/menu.getProducts`, {
        params: { token: POSTER_TOKEN },
        timeout: 30000
      })

      const posterProducts = productsResponse.data.response || []
      console.log(`   Found ${posterProducts.length} products from Poster API`)

      for (const posterProduct of posterProducts) {
        try {
          // Find category ID
          let categoryId = null
          if (posterProduct.category_id) {
            const [categoryResult] = await connection.execute(
              'SELECT id FROM categories WHERE poster_id = ?',
              [posterProduct.category_id]
            )
            
            if (categoryResult.length > 0) {
              categoryId = categoryResult[0].id
            }
          }

          // If no category found, use first available category
          if (!categoryId) {
            const [defaultCat] = await connection.execute(
              'SELECT id FROM categories ORDER BY sort_order LIMIT 1'
            )
            if (defaultCat.length > 0) {
              categoryId = defaultCat[0].id
            }
          }

          // Skip if still no category
          if (!categoryId) {
            console.log(`   ⚠️  Skipping product ${posterProduct.product_name}: No category found`)
            continue
          }

          // Calculate price (convert kopecks to UAH)
          let price = 0
          if (posterProduct.price) {
            if (typeof posterProduct.price === 'object') {
              price = parseFloat(posterProduct.price['1'] || posterProduct.price['0'] || 0) / 100
            } else {
              price = parseFloat(posterProduct.price) / 100
            }
          }

          // Check if product exists
          const [existing] = await connection.execute(
            'SELECT id FROM products WHERE poster_id = ?',
            [posterProduct.product_id]
          )

          if (existing.length > 0) {
            // Update existing product
            await connection.execute(
              'UPDATE products SET name = ?, description = ?, price = ?, category_id = ?, updated_at = NOW() WHERE poster_id = ?',
              [
                posterProduct.product_name,
                posterProduct.product_name,
                price,
                categoryId,
                posterProduct.product_id
              ]
            )
          } else {
            // Create new product
            await connection.execute(
              'INSERT INTO products (id, poster_id, category_id, name, description, price, is_active, stock_quantity, unit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
              [
                generateId(),
                posterProduct.product_id,
                categoryId,
                posterProduct.product_name,
                posterProduct.product_name,
                price,
                1,
                0,
                'шт'
              ]
            )
          }
          syncResults.products++
        } catch (error) {
          console.error(`   ❌ Failed to sync product ${posterProduct.product_name}:`, error.message)
          syncResults.errors.push(`Product ${posterProduct.product_name}: ${error.message}`)
        }
      }
      console.log(`   ✅ Synced ${syncResults.products} products`)
    } catch (error) {
      console.error('❌ Products sync failed:', error.message)
      syncResults.errors.push(`Products sync: ${error.message}`)
    }

    // 3. Sync Branches/Storages
    console.log('🏪 Syncing branches...')
    try {
      const branchesResponse = await axios.get(`${POSTER_API_BASE}/storage.getStorages`, {
        params: { token: POSTER_TOKEN },
        timeout: 30000
      })

      const posterBranches = branchesResponse.data.response || []
      console.log(`   Found ${posterBranches.length} storages from Poster API`)

      for (const storage of posterBranches) {
        try {
          // Check if branch exists
          const [existing] = await connection.execute(
            'SELECT id FROM branches WHERE poster_id = ?',
            [storage.storage_id]
          )

          const branchData = {
            name: storage.storage_name || `Storage ${storage.storage_id}`,
            address: `Storage Location ${storage.storage_id}`,
            phone: '+38 (097) 324 46 68',
            working_hours: '10:00-22:00 щодня',
            latitude: 50.4501,
            longitude: 30.5234
          }

          if (existing.length > 0) {
            // Update existing branch
            await connection.execute(
              'UPDATE branches SET name = ?, address = ?, phone = ?, working_hours = ?, updated_at = NOW() WHERE poster_id = ?',
              [
                branchData.name,
                branchData.address,
                branchData.phone,
                branchData.working_hours,
                storage.storage_id
              ]
            )
          } else {
            // Create new branch
            await connection.execute(
              'INSERT INTO branches (id, poster_id, name, address, phone, working_hours, is_active, latitude, longitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
              [
                generateId(),
                storage.storage_id,
                branchData.name,
                branchData.address,
                branchData.phone,
                branchData.working_hours,
                1,
                branchData.latitude,
                branchData.longitude
              ]
            )
          }
          syncResults.branches++
        } catch (error) {
          console.error(`   ❌ Failed to sync branch ${storage.storage_name}:`, error.message)
          syncResults.errors.push(`Branch ${storage.storage_name}: ${error.message}`)
        }
      }
      console.log(`   ✅ Synced ${syncResults.branches} branches`)
    } catch (error) {
      console.error('❌ Branches sync failed:', error.message)
      syncResults.errors.push(`Branches sync: ${error.message}`)
    }

    // 4. Sync Inventory
    console.log('📦 Syncing inventory...')
    try {
      const inventoryResponse = await axios.get(`${POSTER_API_BASE}/storage.getStorageLeftovers`, {
        params: { token: POSTER_TOKEN },
        timeout: 30000
      })

      const inventory = inventoryResponse.data.response || []
      console.log(`   Found ${inventory.length} inventory items from Poster API`)

      for (const item of inventory) {
        try {
          // Find product by ingredient_id
          const [productResult] = await connection.execute(
            'SELECT id FROM products WHERE poster_id = ?',
            [item.ingredient_id]
          )

          if (productResult.length === 0) continue

          const productId = productResult[0].id

          // Find branch by storage_id
          const [branchResult] = await connection.execute(
            'SELECT id FROM branches WHERE poster_id = ?',
            [item.storage_id]
          )

          if (branchResult.length === 0) continue

          const branchId = branchResult[0].id

          // Update or create inventory record
          const quantity = parseFloat(item.storage_ingredient_left) || 0

          const [existingInventory] = await connection.execute(
            'SELECT id FROM product_inventory WHERE product_id = ? AND branch_id = ?',
            [productId, branchId]
          )

          if (existingInventory.length > 0) {
            // Update existing
            await connection.execute(
              'UPDATE product_inventory SET quantity = ?, last_updated = NOW() WHERE product_id = ? AND branch_id = ?',
              [quantity, productId, branchId]
            )
          } else {
            // Create new
            await connection.execute(
              'INSERT INTO product_inventory (id, product_id, branch_id, quantity, last_updated) VALUES (?, ?, ?, ?, NOW())',
              [generateId(), productId, branchId, quantity]
            )
          }
          syncResults.inventory++
        } catch (error) {
          console.error(`   ❌ Failed to sync inventory item:`, error.message)
          syncResults.errors.push(`Inventory item: ${error.message}`)
        }
      }
      console.log(`   ✅ Synced ${syncResults.inventory} inventory items`)
    } catch (error) {
      console.error('❌ Inventory sync failed:', error.message)
      syncResults.errors.push(`Inventory sync: ${error.message}`)
    }

    // Final counts
    const [finalCounts] = await connection.execute(`
      SELECT 
        (SELECT COUNT(*) FROM categories) as categories,
        (SELECT COUNT(*) FROM products) as products,
        (SELECT COUNT(*) FROM branches) as branches,
        (SELECT COUNT(*) FROM product_inventory) as inventory
    `)

    console.log('🎉 Sync completed!')
    console.log(`📊 Final counts: ${finalCounts[0].categories} categories, ${finalCounts[0].products} products, ${finalCounts[0].branches} branches, ${finalCounts[0].inventory} inventory items`)

    res.json({
      success: true,
      message: 'Full sync completed successfully',
      results: {
        synced: syncResults,
        final_counts: finalCounts[0],
        errors: syncResults.errors
      }
    })

  } catch (error) {
    console.error('💥 Full sync failed:', error)
    res.status(500).json({
      success: false,
      error: 'Full sync failed',
      message: error.message
    })
  } finally {
    if (connection) {
      await connection.end()
    }
  }
})

export default router
