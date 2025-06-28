import axios from 'axios'

// Viber Bot configuration
const VIBER_BOT_TOKEN = process.env.VIBER_BOT_TOKEN || ''
const VIBER_API_URL = 'https://chatapi.viber.com/pa/send_message'

class ViberService {
  constructor() {
    this.botToken = VIBER_BOT_TOKEN
    this.apiUrl = VIBER_API_URL
  }

  /**
   * Send a text message to a Viber user
   */
  async sendMessage(receiverId, text, keyboard = null) {
    if (!this.botToken) {
      console.warn('⚠️ Viber bot token not configured')
      return { success: false, error: 'Bot token not configured' }
    }

    try {
      const payload = {
        receiver: receiverId,
        type: 'text',
        text: text
      }

      // Add keyboard if provided
      if (keyboard) {
        payload.keyboard = keyboard
      }

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Viber-Auth-Token': this.botToken
        }
      })

      
      return { success: true, data: response.data }

    } catch (error) {
      console.error('❌ Failed to send Viber message:', error.response?.data || error.message)
      return { 
        success: false, 
        error: error.response?.data || error.message 
      }
    }
  }

  /**
   * Send order confirmation to customer via Viber
   */
  async sendOrderConfirmation(order) {
    if (!order.customer_phone) {
      
      return { success: false, error: 'No phone number' }
    }

    // Convert phone number to Viber format (remove + and spaces)
    const viberReceiver = order.customer_phone.replace(/[\s\+\-\(\)]/g, '')

    // Generate order confirmation message
    const message = this.generateOrderConfirmationMessage(order)

    // Create keyboard with useful buttons
    const keyboard = {
      Type: 'keyboard',
      Buttons: [
        {
          Text: '📞 Зв\'язатися з нами',
          ActionType: 'open-url',
          ActionBody: 'viber://chat?number=%2B380973244668',
          BgColor: '#2563eb',
          TextColor: '#ffffff'
        },
        {
          Text: '🌐 Наш сайт',
          ActionType: 'open-url', 
          ActionBody: 'https://opillia.com.ua',
          BgColor: '#64748b',
          TextColor: '#ffffff'
        }
      ]
    }

    return await this.sendMessage(viberReceiver, message, keyboard)
  }

  /**
   * Send order status update to customer via Viber
   */
  async sendOrderStatusUpdate(order, newStatus) {
    if (!order.customer_phone) {
      
      return { success: false, error: 'No phone number' }
    }

    const viberReceiver = order.customer_phone.replace(/[\s\+\-\(\)]/g, '')
    const message = this.generateStatusUpdateMessage(order, newStatus)

    return await this.sendMessage(viberReceiver, message)
  }

  /**
   * Generate order confirmation message text
   */
  generateOrderConfirmationMessage(order) {
    const deliveryInfo = order.delivery_method === 'delivery'
      ? `🚚 Доставка за адресою: ${order.delivery_address}`
      : `🏪 Самовивіз з магазину: ${order.pickup_branch?.name || 'Не вказано'}`

    const itemsList = order.items.map(item => 
      `• ${item.name} - ${item.quantity} шт. × ${item.price.toFixed(2)} UAH`
    ).join('\n')

    const estimatedTime = order.estimated_delivery
      ? new Date(order.estimated_delivery).toLocaleString('uk-UA', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : 'Уточнюється'

    return `
🎉 Вітаємо, ${order.customer_name}!

Ваше замовлення №${order.order_number} успішно оформлено.

📦 ТОВАРИ:
${itemsList}

💰 ПІДСУМОК:
Сума товарів: ${order.subtotal.toFixed(2)} UAH
Доставка: ${order.delivery_fee.toFixed(2)} UAH
💳 Загальна сума: ${order.total.toFixed(2)} UAH

🚀 ДОСТАВКА:
${deliveryInfo}
⏰ Орієнтовний час: ${estimatedTime}

💵 ОПЛАТА: Оплата при отриманні

${order.notes ? `📝 КОМЕНТАР: ${order.notes}\n` : ''}

Наш менеджер зв'яжеться з вами найближчим часом для підтвердження деталей.

З повагою,
Команда Опілля 🍺

📞 +38 (097) 324 46 68
✉️ info@opillia.com.ua
    `.trim()
  }

  /**
   * Generate status update message text
   */
  generateStatusUpdateMessage(order, newStatus) {
    const statusMessages = {
      'confirmed': '✅ Ваше замовлення підтверджено і передано в обробку',
      'preparing': '👨‍🍳 Ваше замовлення готується',
      'ready': '🎉 Ваше замовлення готове до видачі!',
      'out_for_delivery': '🚚 Ваше замовлення в дорозі',
      'delivered': '✅ Ваше замовлення доставлено. Дякуємо за покупку!',
      'cancelled': '❌ Ваше замовлення скасовано'
    }

    const statusText = statusMessages[newStatus] || `Статус замовлення змінено на: ${newStatus}`

    return `
📱 Оновлення замовлення №${order.order_number}

${statusText}

${newStatus === 'ready' && order.delivery_method === 'pickup' ? 
  `🏪 Можете забрати замовлення з магазину: ${order.pickup_branch?.name || 'Не вказано'}` : ''}

${newStatus === 'delivered' ? 
  `🌟 Будемо вдячні за ваш відгук про якість товарів та обслуговування!` : ''}

📞 +38 (097) 324 46 68
✉️ info@opillia.com.ua
    `.trim()
  }
}

// Export singleton instance
export const viberService = new ViberService()

// Export function for easy import
export async function sendViberOrderNotification(order) {
  return await viberService.sendOrderConfirmation(order)
}

export async function sendViberStatusUpdate(order, newStatus) {
  return await viberService.sendOrderStatusUpdate(order, newStatus)
}
