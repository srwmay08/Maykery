const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Client, Environment } = require("square");
const sgMail = require("@sendgrid/mail");

admin.initializeApp();

// Initialize Square Client
const squareClient = new Client({
  environment: Environment.Sandbox, // Change to Environment.Production for live payments
  accessToken: functions.config().square.access_token,
});

// Initialize SendGrid
sgMail.setApiKey(functions.config().sendgrid.api_key);

// Function to create a Square Payment Link
exports.createPaymentLink = functions.https.onCall(async (data, context) => {
  const { order, customer } = data;

  try {
    const response = await squareClient.checkoutApi.createPaymentLink({
      idempotencyKey: context.auth.uid + new Date().toISOString(),
      order: {
        locationId: "LFG29KHEV5M51", // Add your Square Location ID
        lineItems: order.items.map(item => ({
          name: item.name,
          quantity: item.quantity.toString(),
          basePriceMoney: {
            amount: item.price * 100, // Price in cents
            currency: "USD",
          },
        })),
      },
      checkoutOptions: {
        allowTipping: true,
        redirectUrl: "YOUR_SUCCESS_URL", // A page on your site for after payment
      },
       prePopulatedData: {
            buyerEmail: customer.email,
            buyerPhoneNumber: customer.phone,
       }
    });

    return {
      paymentUrl: response.result.paymentLink.url,
      orderId: response.result.paymentLink.orderId
    };
  } catch (error) {
    console.error("Square API Error:", error);
    throw new functions.https.HttpsError("internal", "Failed to create payment link.");
  }
});


// Function to send an email notification when a new order is created
exports.sendOrderConfirmationEmail = functions.firestore
  .document("orders/{orderId}")
  .onCreate((snap, context) => {
    const orderData = snap.data();

    const msg = {
      to: "sean@maykery.com", // Your email
      from: "noreply@yourdomain.com", // A verified email with SendGrid
      subject: "New Pre-order Received!",
      html: `<p>You have a new order from ${orderData.customerName} for pickup on ${orderData.pickupDay}.</p>`, // Customize as needed
    };

    return sgMail.send(msg);
  });