const express = require('express');
const mercadopago = require('mercadopago');
const dotenv = require('dotenv');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

mercadopago.configure({
  access_token: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.post('/create-mercadopago-payment', async (req, res) => {
    try {
      const { total, referenceCode, buyerEmail, description } = req.body;
  
      if (!total || !referenceCode || !buyerEmail) {
        return res.status(400).json({ error: 'Faltan parámetros: total, referenceCode y buyerEmail son obligatorios' });
      }
  
      const preference = {
        items: [
          {
            title: description,
            unit_price: parseFloat(total),
            quantity: 1,
            currency_id: 'COP',
          },
        ],
        external_reference: referenceCode,
        payer: {
          email: buyerEmail,
        },
        back_urls: {
          success: 'https://outside-project.vercel.app/success', // URL de producción
          failure: 'https://outside-project.vercel.app/cancel',  // URL de producción
          pending: 'https://outside-project.vercel.app/pending', // URL de producción
        },
        auto_return: 'approved',
        notification_url: 'https://outside-backend.vercel.app/webhook', // URL de producción para el webhook
      };
  
      console.log('Creando preferencia de pago:', preference);
  
      const response = await mercadopago.preferences.create(preference);
      console.log('Respuesta de Mercado Pago:', response.body);
  
      const isTestMode = process.env.MERCADOPAGO_TEST_MODE === 'true';
      const paymentUrl = isTestMode ? response.body.sandbox_init_point : response.body.init_point;
  
      res.json({
        paymentUrl,
      });
    } catch (error) {
      console.error('Error al crear preferencia de Mercado Pago:', error);
      res.status(500).json({ error: 'Error al crear el pago' });
    }
  });

app.post('/webhook', async (req, res) => {
  try {
    const notificationData = req.body;
    console.log('Notificación de Mercado Pago recibida:', notificationData);

    if (notificationData.topic === 'merchant_order') {
      const merchantOrderId = notificationData.resource.split('/').pop(); 
      const merchantOrder = await mercadopago.merchant_orders.get(merchantOrderId);

      console.log('Detalles del merchant_order:', merchantOrder.body);

      const { external_reference, payments } = merchantOrder.body;

      if (!external_reference || !payments || payments.length === 0) {
        console.log('No se encontraron pagos o external_reference en el merchant_order');
        return res.status(200).send('OK');
      }

      const purchaseId = external_reference.replace('OUTSIDE_', '');

      const payment = payments[0];
      const status = payment.status; 

      const { error } = await supabase
        .from('purchases')
        .update({ status: status === 'approved' ? 'completed' : status })
        .eq('id', purchaseId);

      if (error) {
        console.error('Error al actualizar el estado de la compra:', error);
      } else {
        console.log(`Estado de la compra ${purchaseId} actualizado a: ${status}`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error al procesar la notificación:', error);
    res.status(500).send('Error');
  }
});

app.listen(4000, () => {
  console.log('Servidor corriendo en puerto 4000');
});