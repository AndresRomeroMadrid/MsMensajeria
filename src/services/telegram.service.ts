import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Sends a notification message via Telegram Bot API
 * @param message The text to send
 * @param chatId The chat ID to send to. If not provided, it will try to use TELEGRAM_CHAT_ID from .env
 */
export const sendTelegramNotification = async (message: string, chatId?: string): Promise<boolean> => {
  const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_BOT_TOKEN || !targetChatId || TELEGRAM_BOT_TOKEN === 'your_bot_token_here') {
    console.warn('Telegram notification skipped: Missing BOT_TOKEN or CHAT_ID');
    return false;
  }

  return new Promise((resolve) => {
    const data = JSON.stringify({
      chat_id: targetChatId,
      text: message,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('Telegram notification sent successfully');
          resolve(true);
        } else {
          console.error(`Telegram API error (${res.statusCode}):`, responseBody);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error sending Telegram notification:', error);
      resolve(false);
    });

    req.write(data);
    req.end();
  });
};
