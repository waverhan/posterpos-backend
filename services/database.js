import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export { prisma }

// Categories
export async function getCategories() {
  const categories = await prisma.category.findMany({
    where: { is_active: true },
    orderBy: { sort_order: 'asc' },
    include: {
      products: {
        where: { is_active: true },
        select: { id: true }
      }
    }
  })

  return categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    display_name: cat.display_name,
    description: cat.description || '',
    image_url: cat.image_url || '',
    sort_order: cat.sort_order,
    is_active: cat.is_active,
    created_at: cat.created_at.toISOString(),
    updated_at: cat.updated_at.toISOString(),
    product_count: cat.products.length
  }))
}

export async function createCategory(data) {
  const category = await prisma.category.create({
    data: {
      name: data.name,
      display_name: data.display_name,
      description: data.description,
      image_url: data.image_url,
      sort_order: data.sort_order || 0,
      is_active: data.is_active !== undefined ? data.is_active : true
    },
    include: {
      products: {
        where: { is_active: true },
        select: { id: true }
      }
    }
  })

  return {
    id: category.id,
    name: category.name,
    display_name: category.display_name,
    description: category.description || '',
    image_url: category.image_url || '',
    sort_order: category.sort_order,
    is_active: category.is_active,
    created_at: category.created_at.toISOString(),
    updated_at: category.updated_at.toISOString(),
    product_count: category.products.length
  }
}

// Helper function to check if a product is weight-based using stored attributes
function isWeightBasedProduct(product) {
  const name = (product.name || '').toLowerCase()

  // Exclude beverages even if they have ingredient_unit = kg
  const isBeverage = name.includes('пиво') || name.includes('вино') || name.includes('сидр') ||
                    name.includes('beer') || name.includes('wine') || name.includes('cocktail') ||
                    name.includes('коктейль') || name.includes('напій') || name.includes('drink')

  if (isBeverage) {
    return false // Beverages are never weight-based, even with kg unit
  }

  // Check stored ingredient_unit from Poster API attributes first
  if (product.attributes) {
    try {
      const attrs = JSON.parse(product.attributes)
      if (attrs.ingredient_unit === 'kg') {
        return true
      }
    } catch (e) {
      // Invalid JSON, continue to other checks
    }
  }

  // Fallback: Check if product has custom_quantity/custom_unit set
  if (product.custom_quantity && product.custom_unit) {
    return true
  }

  // Fallback: Check inventory unit for weight-based products (kg)
  // This helps with products that don't have proper attributes but are weight-based
  const isWeightCategory = name.includes('сир') || name.includes('м\'ясо') || name.includes('ковбаса') ||
                          name.includes('cheese') || name.includes('meat') || name.includes('sausage') ||
                          name.includes('риба') || name.includes('fish') || name.includes('ікра') ||
                          name.includes('ікрян') || name.includes('caviar') || name.includes('закуск') ||
                          name.includes('snack') || name.includes('арахіс') || name.includes('кукурудза') ||
                          name.includes('горіх') || name.includes('peanut') || name.includes('corn') ||
                          name.includes('nut')

  // If it's in a weight category and has inventory, check if inventory unit is kg
  if (isWeightCategory && product.inventory && product.inventory.length > 0) {
    return product.inventory[0].unit === 'kg'
  }

  return false
}

// Helper function to check if a product needs price conversion (beverages with kg unit)
function needsPriceConversion(product) {
  const name = (product.name || '').toLowerCase()

  // Check if it's a beverage with ingredient_unit = kg (these need price conversion)
  const isBeverage = name.includes('пиво') || name.includes('вино') || name.includes('сидр') ||
                    name.includes('beer') || name.includes('wine') || name.includes('cocktail') ||
                    name.includes('коктейль') || name.includes('напій') || name.includes('drink')

  if (isBeverage && product.attributes) {
    try {
      const attrs = JSON.parse(product.attributes)
      return attrs.ingredient_unit === 'kg'
    } catch (e) {
      return false
    }
  }

  return isWeightBasedProduct(product)
}

// Helper function to convert price from stored per-kg to display per-kg/per-liter
function convertPrice(price, product) {
  if (needsPriceConversion(product)) {
    return price * 10 // Convert from per-100g to per-kg or per-liter
  }
  return price
}

// Products
export async function getProducts(categoryId, branchId) {
  const where = { is_active: true }
  if (categoryId) {
    where.category_id = categoryId
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { sort_order: 'asc' },
    include: {
      category: true,
      inventory: branchId ? {
        where: { branch_id: branchId }
      } : true
    }
  })

  return products.map(product => {
    const inventory = branchId
      ? product.inventory.find(inv => inv.branch_id === branchId)
      : product.inventory[0] // Get first inventory if no specific branch

    // Create enhanced product object with inventory for weight-based detection
    const productWithInventory = {
      ...product,
      inventory: inventory ? [inventory] : []
    }

    // Convert price for products that need conversion (weight-based or beverages with kg unit)
    const displayPrice = convertPrice(product.price, productWithInventory)
    const displayOriginalPrice = product.original_price
      ? convertPrice(product.original_price, productWithInventory)
      : null

    // Log price conversion for products that need it
    const isWeightBased = isWeightBasedProduct(productWithInventory)
    const needsConversion = needsPriceConversion(productWithInventory)
    if (needsConversion) {
      const ingredientUnit = product.attributes ? JSON.parse(product.attributes).ingredient_unit : 'N/A'
      const productType = isWeightBased ? 'Weight-based' : 'Beverage'
      const unitType = isWeightBased ? 'kg' : 'L'
      
    }

    return {
      id: product.id,
      poster_product_id: product.poster_product_id,
      ingredient_id: product.ingredient_id,
      category_id: product.category_id,
      name: product.name,
      display_name: product.display_name,
      description: product.description || '',
      price: displayPrice,
      original_price: displayOriginalPrice,
      image_url: product.image_url || '',
      display_image_url: product.display_image_url || '',
      quantity: inventory?.quantity || 0,
      unit: inventory?.unit || (isWeightBased ? 'kg' : 'pcs'),
      available: inventory ? inventory.quantity > 0 : false,
      is_active: product.is_active,
      requires_bottles: product.requires_bottles || false,
      attributes: product.attributes ? JSON.parse(product.attributes) : [],
      // Custom quantity system for weight-based products
      custom_quantity: product.custom_quantity || (isWeightBased ? 0.05 : null),
      custom_unit: product.custom_unit || (isWeightBased ? 'г' : null),
      quantity_step: product.quantity_step,
      min_quantity: product.min_quantity,
      max_quantity: product.max_quantity,
      // Category information for recommendations
      category_name: product.category.display_name,
      category: product.category ? {
        id: product.category.id,
        name: product.category.name,
        display_name: product.category.display_name
      } : null,
      created_at: product.created_at.toISOString(),
      updated_at: product.updated_at.toISOString()
    }
  })
}

export async function createProduct(data) {
  const product = await prisma.product.create({
    data: {
      poster_product_id: data.poster_product_id,
      category_id: data.category_id,
      name: data.name,
      display_name: data.display_name,
      description: data.description,
      price: data.price,
      original_price: data.original_price,
      image_url: data.image_url,
      display_image_url: data.display_image_url,
      is_active: data.is_active !== undefined ? data.is_active : true,
      requires_bottles: data.requires_bottles || false,
      attributes: data.attributes ? JSON.stringify(data.attributes) : null,
      custom_quantity: data.custom_quantity || null,
      custom_unit: data.custom_unit || null,
      quantity_step: data.quantity_step || null,
      min_quantity: data.min_quantity || null,
      max_quantity: data.max_quantity || null
    },
    include: {
      category: true,
      inventory: true
    }
  })

  return {
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
    quantity: 0,
    unit: 'pcs',
    available: false,
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
}

// Branches
export async function getBranches() {
  const branches = await prisma.branch.findMany({
    where: { is_active: true },
    orderBy: { name: 'asc' }
  })

  return branches.map(branch => ({
    id: branch.id,
    poster_id: branch.poster_id,
    name: branch.name,
    address: branch.address || '',
    phone: branch.phone || '',
    email: branch.email || '',
    working_hours: branch.working_hours || '',
    latitude: branch.latitude,
    longitude: branch.longitude,
    delivery_available: branch.delivery_available,
    pickup_available: branch.pickup_available,
    is_active: branch.is_active,
    created_at: branch.created_at.toISOString(),
    updated_at: branch.updated_at.toISOString()
  }))
}

export async function createBranch(data) {
  const branch = await prisma.branch.create({
    data: {
      poster_id: data.poster_id,
      name: data.name,
      address: data.address,
      phone: data.phone,
      email: data.email,
      working_hours: data.working_hours,
      latitude: data.latitude,
      longitude: data.longitude,
      delivery_available: data.delivery_available !== undefined ? data.delivery_available : true,
      pickup_available: data.pickup_available !== undefined ? data.pickup_available : true,
      is_active: data.is_active !== undefined ? data.is_active : true
    }
  })

  return {
    id: branch.id,
    poster_id: branch.poster_id,
    name: branch.name,
    address: branch.address || '',
    phone: branch.phone || '',
    email: branch.email || '',
    working_hours: branch.working_hours || '',
    latitude: branch.latitude,
    longitude: branch.longitude,
    delivery_available: branch.delivery_available,
    pickup_available: branch.pickup_available,
    is_active: branch.is_active,
    created_at: branch.created_at.toISOString(),
    updated_at: branch.updated_at.toISOString()
  }
}

export async function updateBranch(id, data) {
  const branch = await prisma.branch.update({
    where: { id: id }, // Remove parseInt since IDs are strings (cuid)
    data: {
      name: data.name,
      address: data.address,
      phone: data.phone,
      email: data.email,
      working_hours: data.working_hours,
      latitude: data.latitude,
      longitude: data.longitude,
      delivery_available: data.delivery_available,
      pickup_available: data.pickup_available,
      is_active: data.is_active
    }
  })

  return {
    id: branch.id,
    poster_id: branch.poster_id,
    name: branch.name,
    address: branch.address || '',
    phone: branch.phone || '',
    email: branch.email || '',
    working_hours: branch.working_hours || '',
    latitude: branch.latitude,
    longitude: branch.longitude,
    delivery_available: branch.delivery_available,
    pickup_available: branch.pickup_available,
    is_active: branch.is_active,
    created_at: branch.created_at.toISOString(),
    updated_at: branch.updated_at.toISOString()
  }
}

// Inventory
export async function updateInventory(productId, branchId, quantity, unit) {
  await prisma.productInventory.upsert({
    where: {
      product_id_branch_id: {
        product_id: productId,
        branch_id: branchId
      }
    },
    update: {
      quantity,
      unit
    },
    create: {
      product_id: productId,
      branch_id: branchId,
      quantity,
      unit
    }
  })
}
