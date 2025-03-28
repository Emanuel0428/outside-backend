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
    ? 'https://sandbox.checkout.payulatam.com/ppp-web-gateway'
    : 'https://checkout.payulatam.com/ppp-web-gateway',
};

app.post('/create-payu-payment', async (req, res) => {
  try {
    const requiredFields = [
      'total', 'referenceCode', 'description', 'payerFullName', 'payerEmail',
      'payerPhone', 'payerDocumentType', 'payerDocument', 'buyerFullName',
      'buyerEmail', 'buyerDocumentType', 'buyerDocument', 'telephone'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Faltan campos obligatorios: ${missingFields.join(', ')}`
      });
    }

    const signatureString = `${payuConfig.apiKey}~${payuConfig.merchantId}~${req.body.referenceCode}~${req.body.total}~COP`;
    const signature = crypto.createHash('md5').update(signatureString).digest('hex');

    const payuParams = {
      merchantId: payuConfig.merchantId,
      accountId: payuConfig.accountId,
      referenceCode: req.body.referenceCode,
      description: req.body.description,
      amount: req.body.total,
      currency: 'COP',
      signature: signature,
      payerFullName: req.body.payerFullName || "Test Payer",
      payerEmail: req.body.payerEmail || "testpayer@example.com",
      payerPhone: req.body.payerPhone || "123456789",
      payerDocumentType: req.body.payerDocumentType || "CC",
      payerDocument: req.body.payerDocument || "123456789",
      buyerFullName: req.body.buyerFullName || "Test Buyer",
      buyerEmail: req.body.buyerEmail || "testbuyer@example.com",
      buyerDocumentType: req.body.buyerDocumentType || "CC",
      buyerDocument: req.body.buyerDocument || "987654321",
      telephone: req.body.telephone || "987654321",
      responseUrl: payuConfig.responseUrl || "http://localhost:5173/response",
      test: payuConfig.testMode ? '1' : '0',
      tax: '0',
      taxReturnBase: '0',
    };

    res.json({
      paymentUrl: payuConfig.paymentUrl,
      payuParams: payuParams
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al procesar el pago' });
  }
});

app.post('/confirmation', async (req, res) => {
  try {
    const { reference_sale, state_pol } = req.body;
    
    if (!reference_sale) return res.status(200).send('OK');

    const purchaseId = reference_sale.replace('OUTSIDE_', '');
    const statusMap = {
      '4': 'completed', 
      '6': 'declined',   
      '5': 'expired',   
      '7': 'pending'     
    };

    const status = statusMap[state_pol] || 'unknown';

    const { error } = await supabase
      .from('purchases')
      .update({ status })
      .eq('id', purchaseId);

    if (error) console.error('Error updating purchase:', error);

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Error');
  }
});

app.listen(4000, () => {
  console.log('Servidor corriendo en puerto 4000');
});