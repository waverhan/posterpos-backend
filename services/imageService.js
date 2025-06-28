import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class ImageService {
  constructor() {
    this.imagesDir = path.join(__dirname, '../public/images/products')
    this.ensureImagesDirectory()
  }

  ensureImagesDirectory() {
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true })
      
    }
  }

  // Get the correct Poster image URL
  getPosterImageUrl(productId, hasPhoto = true) {
    if (!hasPhoto || !productId) return null

    // Try different possible formats with multiple timestamp patterns
    // Based on real data: 1707315138, 1678998630, 1678998675, 1678998721, 1688988756, 1678785050, etc.
    const timestamps = [
      '1707315138', '1678998630', '1678998675', '1678998721', '1688988756',
      '1678785050', '1678785078', '1717493132', '1678785093', '1678785064',
      '1689445896', '1678785128', '1678996480', '1678996934',
      '1679039883', '1678000000', '1680000000', '' // Fallback patterns + no timestamp
    ]
    const extensions = ['png', 'jpeg', 'jpg', 'webp']
    const possibleUrls = []

    // Generate all possible combinations
    for (const timestamp of timestamps) {
      for (const ext of extensions) {
        if (timestamp) {
          possibleUrls.push(`https://joinposter.com/upload/pos_cdb_214175/menu/product_${timestamp}_${productId}.${ext}`)
        } else {
          possibleUrls.push(`https://joinposter.com/upload/pos_cdb_214175/menu/product_${productId}.${ext}`)
        }
      }
    }

    return possibleUrls
  }

  // Check if image exists at URL
  async checkImageExists(url) {
    try {
      const response = await axios.head(url, { timeout: 5000 })
      return response.status === 200
    } catch (error) {
      return false
    }
  }

  // Find the correct image URL from possible formats
  async findCorrectImageUrl(productId, hasPhoto = true) {
    if (!hasPhoto || !productId) return null

    const possibleUrls = this.getPosterImageUrl(productId, hasPhoto)

    for (const url of possibleUrls) {
      
      if (await this.checkImageExists(url)) {
        
        return url
      }
    }

    
    return null
  }

  // Download and save image locally
  async downloadImage(imageUrl, productId) {
    try {
      if (!imageUrl) return null

      const response = await axios.get(imageUrl, {
        responseType: 'stream',
        timeout: 10000
      })

      // Get file extension from URL or default to jpg
      const urlParts = imageUrl.split('.')
      const extension = urlParts[urlParts.length - 1].split('?')[0] || 'jpg'

      const filename = `product_${productId}.${extension}`
      const filepath = path.join(this.imagesDir, filename)

      // Create write stream
      const writer = fs.createWriteStream(filepath)
      response.data.pipe(writer)

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          
          resolve(`/images/products/${filename}`)
        })
        writer.on('error', (error) => {
          console.error(`❌ Failed to save image ${filename}:`, error.message)
          reject(error)
        })
      })

    } catch (error) {
      console.error(`❌ Failed to download image for product ${productId}:`, error.message)
      return null
    }
  }

  // Process product image: download from Poster API and store locally
  async processProductImage(productId, hasPhoto = true, posterImageUrl = null) {
    try {
      // Check if we already have the image locally
      const localImagePath = this.getLocalImagePath(productId)
      if (localImagePath) {
        
        return `/images/products/${path.basename(localImagePath)}`
      }

      // Use provided Poster image URL first, then fallback to finding URL
      let correctUrl = posterImageUrl
      if (!correctUrl) {
        correctUrl = await this.findCorrectImageUrl(productId, hasPhoto)
      }

      if (!correctUrl) {
        return null
      }

      // Download and save the image locally
      const localPath = await this.downloadImage(correctUrl, productId)
      if (localPath) {
        // Return the web-accessible path
        return `/images/products/${path.basename(localPath)}`
      }

      return null

    } catch (error) {
      console.error(`❌ Failed to process image for product ${productId}:`, error.message)
      return null
    }
  }

  // Check if we already have the image locally
  getLocalImagePath(productId) {
    const extensions = ['png', 'jpg', 'jpeg']

    for (const ext of extensions) {
      const filename = `product_${productId}.${ext}`
      const filepath = path.join(this.imagesDir, filename)

      if (fs.existsSync(filepath)) {
        return `/images/products/${filename}`
      }
    }

    return null
  }

  // Batch process images for multiple products
  async processProductImages(products) {
    

    const results = []
    const batchSize = 5 // Process 5 images at a time to avoid overwhelming the server

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize)

      const batchPromises = batch.map(async (product) => {
        const localImagePath = await this.processProductImage(product.poster_product_id, product.hasPhoto)
        return {
          productId: product.poster_product_id,
          localImagePath,
          originalUrl: product.image_url
        }
      })

      const batchResults = await Promise.allSettled(batchPromises)
      results.push(...batchResults.map(result => result.status === 'fulfilled' ? result.value : null))

      // Small delay between batches
      if (i + batchSize < products.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    const successCount = results.filter(r => r && r.localImagePath).length
    

    return results
  }

  // Clean up old/unused images
  async cleanupImages() {
    try {
      const files = fs.readdirSync(this.imagesDir)
      

      // This is a placeholder - you might want to implement logic to remove
      // images for products that no longer exist

    } catch (error) {
      console.error('❌ Failed to cleanup images:', error.message)
    }
  }
}

export const imageService = new ImageService()
export default imageService
