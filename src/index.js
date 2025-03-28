const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();


const allowedOrigins = [
  'http://localhost:5173',
  'https://outside-project.vercel.app', 
  "https://outside-zone.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);


const payuConfig = {
  merchantId: process.env.PAYU_MERCHANT_ID,
  apiKey: process.env.PAYU_API_KEY,
  accountId: process.env.PAYU_ACCOUNT_ID,
  testMode: process.env.PAYU_TEST_MODE === 'true',
  paymentUrl: process.env.PAYU_TEST_MODE === 'true'
    ? 'https://sandbox.checkout.payulatam.com/ppp-web-gateway-payu/' 
    : 'https://checkout.payulatam.com/ppp-web-gateway-payu/', 
};


app.post('/create-payu-payment', async (req, res) => {
  try {
    const { total, referenceCode, buyerEmail, description } = req.body;

    if (!total || !referenceCode || !buyerEmail || !description) {
      return res.status(400).json({ error: 'Faltan parámetros: total, referenceCode, buyerEmail y description son obligatorios' });
    }

    const signatureString = `${payuConfig.apiKey}~${payuConfig.merchantId}~${referenceCode}~${total}~COP`;
    const signature = crypto.createHash('md5').update(signatureString).digest('hex');

    const payuParams = {
      merchantId: payuConfig.merchantId,
      referenceCode: referenceCode,
      description: description,
      amount: total,
      currency: 'COP',
      signature: signature,
      buyerEmail: buyerEmail,
      responseUrl: 'https://outside-zone/success',
      confirmationUrl: 'https://outside-zone.com/confirmation', 
      test: payuConfig.testMode ? '1' : '0', 
      tax: '0', 
      taxReturnBase: '0', 
      accountId: payuConfig.accountId, 
    };

    console.log('Parámetros de PayU:', payuParams);

    res.json({
      paymentUrl: payuConfig.paymentUrl,
      payuParams: payuParams,
    });
  } catch (error) {
    console.error('Error al crear el pago con PayU:', error);
    res.status(500).json({ error: 'Error al crear el pago' });
  }
});

app.post('/confirmation', async (req, res) => {
  try {
    const { reference_sale, state_pol, transaction_id } = req.body;

    console.log('Notificación de PayU recibida:', req.body);

    if (!reference_sale) {
      console.log('No se encontró reference_sale en la notificación');
      return res.status(200).send('OK');
    }


    const purchaseId = reference_sale.replace('OUTSIDE_', '');

    let status;
    switch (state_pol) {
      case '4':
        status = 'completed';
        break;
      case '6': 
        status = 'declined';
        break;
      case '5': 
        status = 'expired';
        break;
      case '7':
        status = 'pending';
        break;
      default:
        status = 'unknown';
    }

    const { error } = await supabase
      .from('purchases')
      .update({ status: status })
      .eq('id', purchaseId);

    if (error) {
      console.error('Error al actualizar el estado de la compra:', error);
    } else {
      console.log(`Estado de la compra ${purchaseId} actualizado a: ${status}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error al procesar la notificación de PayU:', error);
    res.status(500).send('Error');
  }
});

app.listen(4000, () => {
  console.log('Servidor corriendo en puerto 4000');
});