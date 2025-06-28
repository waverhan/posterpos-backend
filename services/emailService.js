import nodemailer from 'nodemailer'

class EmailService {
  constructor() {
    this.transporter = null
    this.isConfigured = false
    this.initializeTransporter()
  }

  initializeTransporter() {
    try {
      // Configure email transporter based on environment variables
      const emailConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      }

      // Only create transporter if credentials are provided
      if (emailConfig.auth.user && emailConfig.auth.pass) {
        this.transporter = nodemailer.createTransporter(emailConfig)
        this.isConfigured = true
        
      } else {
        
        
      }
    } catch (error) {
      console.error('❌ Failed to configure email service:', error)
    }
  }

  async sendOrderConfirmationEmail(order) {
    if (!this.isConfigured) {
      
      return { success: false, error: 'Email service not configured' }
    }

    try {
      const emailContent = this.generateOrderConfirmationEmail(order)
      
      const mailOptions = {
        from: `"${process.env.SHOP_NAME || 'Opillia Shop'}" <${process.env.SMTP_USER}>`,
        to: order.customer?.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
      }

      
      const result = await this.transporter.sendMail(mailOptions)
      
      
      return { success: true, messageId: result.messageId }
    } catch (error) {
      console.error('❌ Failed to send order confirmation email:', error)
      return { success: false, error: error.message }
    }
  }

  generateOrderConfirmationEmail(order) {
    const shopName = process.env.SHOP_NAME || 'Opillia Shop'
    const shopPhone = process.env.SHOP_PHONE || '+38 (097) 324 46 68'
    const shopEmail = process.env.SHOP_EMAIL || 'info@opillia.com.ua'
    const shopWebsite = process.env.SHOP_WEBSITE || 'https://opillia.com.ua'

    const subject = `Підтвердження замовлення №${order.order_number} - ${shopName}`

    // Format delivery information
    const deliveryInfo = order.fulfillment === 'DELIVERY'
      ? `Доставка за адресою: ${order.delivery_address}`
      : `Самовивіз з магазину: ${order.branch?.name || 'Не вказано'}`

    // Format items list
    const itemsList = order.items.map(item =>
      `• ${item.product?.name || 'Товар'} - ${item.quantity} шт. × ${item.unit_price.toFixed(2)} ₴ = ${item.total_price.toFixed(2)} ₴`
    ).join('\n')

    // Format estimated time
    const estimatedTime = order.estimated_delivery
      ? new Date(order.estimated_delivery).toLocaleString('uk-UA', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : 'Уточнюється'

    // Calculate subtotal
    const subtotal = order.total_amount - (order.delivery_fee || 0)

    const text = `
Вітаємо, ${order.customer?.name || 'Шановний клієнте'}!

Ваше замовлення №${order.order_number} успішно оформлено та передано в обробку.

ДЕТАЛІ ЗАМОВЛЕННЯ:
${itemsList}

ПІДСУМОК:
Сума товарів: ${subtotal.toFixed(2)} ₴
Доставка: ${(order.delivery_fee || 0).toFixed(2)} ₴
Загальна сума: ${order.total_amount.toFixed(2)} ₴

СПОСІБ ОТРИМАННЯ:
${deliveryInfo}
Орієнтовний час: ${estimatedTime}

ОПЛАТА:
Оплата при отриманні (готівка або картка)

${order.notes ? `КОМЕНТАР ДО ЗАМОВЛЕННЯ:\n${order.notes}\n` : ''}

Наш менеджер зв'яжеться з вами найближчим часом для підтвердження деталей замовлення.

Дякуємо за вибір ${shopName}!

З повагою,
Команда ${shopName}

КОНТАКТИ:
📞 ${shopPhone}
✉️ ${shopEmail}
🌐 ${shopWebsite}

---
Це автоматичне повідомлення. Будь ласка, не відповідайте на цей лист.
    `.trim()

    const html = `
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Підтвердження замовлення</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
        .order-number { font-size: 24px; font-weight: bold; margin: 10px 0; }
        .section { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .section h3 { margin-top: 0; color: #2563eb; }
        .items-list { list-style: none; padding: 0; }
        .items-list li { padding: 8px 0; border-bottom: 1px solid #e9ecef; }
        .total-row { font-weight: bold; font-size: 18px; color: #2563eb; }
        .footer { text-align: center; margin-top: 30px; padding: 20px; background: #e9ecef; border-radius: 8px; }
        .contact-info { margin: 10px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🛒 ${shopName}</h1>
        <div class="order-number">Замовлення №${order.order_number}</div>
        <p>Ваше замовлення успішно оформлено!</p>
    </div>

    <p>Вітаємо, <strong>${order.customer?.name || 'Шановний клієнте'}</strong>!</p>
    <p>Дякуємо за ваше замовлення. Ми вже почали його обробку.</p>

    <div class="section">
        <h3>📦 Деталі замовлення</h3>
        <ul class="items-list">
            ${order.items.map(item => `
                <li>
                    <strong>${item.product?.name || 'Товар'}</strong><br>
                    ${item.quantity} шт. × ${item.unit_price.toFixed(2)} ₴ = <strong>${item.total_price.toFixed(2)} ₴</strong>
                </li>
            `).join('')}
        </ul>
    </div>

    <div class="section">
        <h3>💰 Підсумок</h3>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
            <span>Сума товарів:</span>
            <span>${subtotal.toFixed(2)} ₴</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin: 5px 0;">
            <span>Доставка:</span>
            <span>${(order.delivery_fee || 0).toFixed(2)} ₴</span>
        </div>
        <hr>
        <div class="total-row" style="display: flex; justify-content: space-between; margin: 10px 0;">
            <span>Загальна сума:</span>
            <span>${order.total_amount.toFixed(2)} ₴</span>
        </div>
    </div>

    <div class="section">
        <h3>🚚 Спосіб отримання</h3>
        <p><strong>${deliveryInfo}</strong></p>
        <p>Орієнтовний час: <strong>${estimatedTime}</strong></p>
    </div>

    <div class="section">
        <h3>💳 Оплата</h3>
        <p>Оплата при отриманні (готівка або картка)</p>
    </div>

    ${order.notes ? `
    <div class="section">
        <h3>📝 Коментар до замовлення</h3>
        <p>${order.notes}</p>
    </div>
    ` : ''}

    <div class="section">
        <h3>📞 Що далі?</h3>
        <p>Наш менеджер зв'яжеться з вами найближчим часом для підтвердження деталей замовлення.</p>
    </div>

    <div class="footer">
        <h3>Дякуємо за вибір ${shopName}!</h3>
        <div class="contact-info">
            <div>📞 ${shopPhone}</div>
            <div>✉️ ${shopEmail}</div>
            <div>🌐 ${shopWebsite}</div>
        </div>
        <p style="font-size: 12px; color: #666; margin-top: 20px;">
            Це автоматичне повідомлення. Будь ласка, не відповідайте на цей лист.
        </p>
    </div>
</body>
</html>
    `.trim()

    return { subject, text, html }
  }

  async sendOrderStatusUpdateEmail(order, newStatus) {
    if (!this.isConfigured || !order.customer?.email) {
      return { success: false, error: 'Email service not configured or no customer email' }
    }

    try {
      const emailContent = this.generateStatusUpdateEmail(order, newStatus)
      
      const mailOptions = {
        from: `"${process.env.SHOP_NAME || 'Opillia Shop'}" <${process.env.SMTP_USER}>`,
        to: order.customer.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
      }

      const result = await this.transporter.sendMail(mailOptions)
      
      return { success: true, messageId: result.messageId }
    } catch (error) {
      console.error('❌ Failed to send status update email:', error)
      return { success: false, error: error.message }
    }
  }

  generateStatusUpdateEmail(order, newStatus) {
    const shopName = process.env.SHOP_NAME || 'Opillia Shop'
    const statusMessages = {
      'CONFIRMED': 'підтверджено',
      'PREPARING': 'готується',
      'READY': 'готове до видачі',
      'DELIVERED': 'доставлено',
      'COMPLETED': 'виконано'
    }

    const statusText = statusMessages[newStatus] || newStatus.toLowerCase()
    const subject = `Оновлення замовлення №${order.order_number} - ${statusText}`

    const text = `
Вітаємо, ${order.customer?.name || 'Шановний клієнте'}!

Статус вашого замовлення №${order.order_number} змінено на: ${statusText.toUpperCase()}

${newStatus === 'READY' && order.fulfillment === 'PICKUP' ? 
  `🏪 Ваше замовлення готове до самовивозу з магазину: ${order.branch?.name || 'Не вказано'}` : ''}

${newStatus === 'DELIVERED' || newStatus === 'COMPLETED' ? 
  `🌟 Дякуємо за покупку! Будемо вдячні за ваш відгук про якість товарів та обслуговування.` : ''}

З повагою,
Команда ${shopName}

📞 ${process.env.SHOP_PHONE || '+38 (097) 324 46 68'}
✉️ ${process.env.SHOP_EMAIL || 'info@opillia.com.ua'}
    `.trim()

    const html = `
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Оновлення замовлення</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
        .status-update { background: #d1fae5; border: 2px solid #10b981; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding: 20px; background: #e9ecef; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🛒 ${shopName}</h1>
        <h2>Оновлення замовлення №${order.order_number}</h2>
    </div>

    <p>Вітаємо, <strong>${order.customer?.name || 'Шановний клієнте'}</strong>!</p>

    <div class="status-update">
        <h3>📋 Новий статус замовлення:</h3>
        <h2 style="color: #10b981; margin: 10px 0;">${statusText.toUpperCase()}</h2>
    </div>

    ${newStatus === 'READY' && order.fulfillment === 'PICKUP' ? `
    <div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3>🏪 Готове до самовивозу!</h3>
        <p>Ваше замовлення готове до самовивозу з магазину: <strong>${order.branch?.name || 'Не вказано'}</strong></p>
    </div>
    ` : ''}

    ${newStatus === 'DELIVERED' || newStatus === 'COMPLETED' ? `
    <div style="background: #ddd6fe; border: 2px solid #8b5cf6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3>🌟 Дякуємо за покупку!</h3>
        <p>Будемо вдячні за ваш відгук про якість товарів та обслуговування.</p>
    </div>
    ` : ''}

    <div class="footer">
        <h3>З повагою, команда ${shopName}!</h3>
        <div>📞 ${process.env.SHOP_PHONE || '+38 (097) 324 46 68'}</div>
        <div>✉️ ${process.env.SHOP_EMAIL || 'info@opillia.com.ua'}</div>
    </div>
</body>
</html>
    `.trim()

    return { subject, text, html }
  }
}

// Export singleton instance
export const emailService = new EmailService()
