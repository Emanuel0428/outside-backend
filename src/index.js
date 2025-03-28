// En outside-backend/src/index.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Configurar Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Configurar PayU
const payuConfig = {
  merchantId: process.env.PAYU_MERCHANT_ID,
  apiKey: process.env.PAYU_API_KEY,
  accountId: process.env.PAYU_ACCOUNT_ID,
  testMode: process.env.PAYU_TEST_MODE === 'true',
  paymentUrl: process.env.PAYU_TEST_MODE === 'true'
    ? 'https://sandbox.checkout.payulatam.com/ppp-web-gateway' // Sandbox
    : 'https://checkout.payulatam.com/ppp-web-gateway', // Producción
};

// Endpoint para crear un pago con PayU
app.post('/create-payu-payment', async (req, res) => {
  try {
    const { total, referenceCode, buyerEmail, description } = req.body;

    if (!total || !referenceCode || !buyerEmail) {
      return res.status(400).json({ error: 'Faltan parámetros: total, referenceCode y buyerEmail son obligatorios' });
    }

    // Generar la firma (signature) para PayU
    const signatureString = `${payuConfig.apiKey}~${payuConfig.merchantId}~${referenceCode}~${total}~COP`;
    const signature = crypto.createHash('md5').update(signatureString).digest('hex');

    // Parámetros para el formulario de PayU
    const payuParams = {
      merchantId: payuConfig.merchantId,
      accountId: payuConfig.accountId,
      description: description,
      referenceCode: referenceCode,
      amount: total,
      tax: '0', // Impuestos (ajusta según tus necesidades)
      taxReturnBase: '0', // Base para impuestos (ajusta según tus necesidades)
      currency: 'COP',
      signature: signature,
      test: payuConfig.testMode ? '1' : '0', // 1 para sandbox, 0 para producción
      buyerEmail: buyerEmail,
      responseUrl: 'http://localhost:5173/success', // URL de retorno para pruebas locales
      confirmationUrl: 'http://localhost:4000/confirmation', // URL de confirmación para pruebas locales
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

// Endpoint para recibir notificaciones de confirmación de PayU (webhook)
app.post('/confirmation', async (req, res) => {
  try {
    const { reference_sale, state_pol, transaction_id } = req.body;

    console.log('Notificación de PayU recibida:', req.body);

    if (!reference_sale) {
      console.log('No se encontró reference_sale en la notificación');
      return res.status(200).send('OK');
    }

    // Extraer el purchaseId del reference_sale
    const purchaseId = reference_sale.replace('OUTSIDE_', '');

    // Mapear el estado de PayU a un estado interno
    let status;
    switch (state_pol) {
      case '4': // Aprobada
        status = 'completed';
        break;
      case '6': // Declinada
        status = 'declined';
        break;
      case '5': // Expirada
        status = 'expired';
        break;
      case '7': // Pendiente
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