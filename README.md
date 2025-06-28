# PosterPOS Backend API

Separate backend deployment for the PWA POS system using Netlify Functions.

## 🚀 Features

- **Working Products API**: Proper field mapping (quantity, available)
- **Categories API**: Full category listing
- **MySQL Database**: Direct connection to production database
- **CORS Enabled**: Ready for frontend integration

## 📋 API Endpoints

- `GET /health` - Health check
- `GET /api/categories` - Get categories
- `GET /api/products` - Get products (with category filtering)
- `GET /api/products?categoryId=xxx` - Filter by category

## 🔧 Deployment

Deploy this to Netlify as a separate site.

## 🎯 Frontend Integration

Update your frontend to use this backend URL instead of the monorepo functions.
