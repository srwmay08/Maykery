// Firebase v2 Imports
const {onCall} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {log} = require("firebase-functions/logger");

// Other Imports
const admin = require("firebase-admin");
const { Client, Environment } = require("square");
const sgMail = require("@sendgrid/mail");

admin.initializeApp();

// Initialize Square Client
const squareClient = new Client({
  environment: Environment.Sandbox, // Change to Environment.Production for live payments
  accessToken: process.env.SQUARE_ACCESS_TOKEN, // Use environment variables for security
});

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY); // Use environment variables for security

// Function to create a Square Payment Link
exports.createPaymentLink = onCall(async (request) => {
  const { data } = request;
  const { order, customer } = data;

  // Ensure user is authenticated to get a UID
  if (!request.auth) {
    throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const uid = request.auth.uid;

  try {
    const response = await squareClient.checkoutApi.createPaymentLink({
      idempotencyKey: uid + new Date().toISOString(),
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
        redirectUrl: "success.html", // A page on your site for after payment
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
    log("Square API Error:", error);
    throw new functions.https.HttpsError("internal", "Failed to create payment link.");
  }
});


// Function to send an email notification when a new order is created
exports.sendOrderConfirmationEmail = onDocumentCreated("orders/{orderId}", (event) => {
  const orderData = event.data.data();

  const msg = {
    to: "sean@maykery.com", // Your email
    from: "noreply@yourdomain.com", // A verified email with SendGrid
    subject: "New Pre-order Received!",
    html: `<p>You have a new order from ${orderData.customerName} for pickup on ${orderData.pickupDay}.</p>`, // Customize as needed
  };

  log("Sending order confirmation email to:", msg.to);
  return sgMail.send(msg);
});