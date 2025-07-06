const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Client, Environment } = require("square");
const sgMail = require("@sendgrid/mail");
const cors = require("cors")({ origin: true }); // Initialize CORS middleware

admin.initializeApp();

// Initialize Square Client
const squareClient = new Client({
  environment: Environment.Sandbox, // Change to Environment.Production for live payments
  accessToken: functions.config().square.access_token,
});

// Initialize SendGrid
sgMail.setApiKey(functions.config().sendgrid.api_key);

// Function to create a Square Payment Link (now as an onRequest function)
exports.createPaymentLink = functions.https.onRequest((req, res) => {
  // Wrap the function in the cors middleware
  cors(req, res, async () => {
    // The httpsCallable function sends a POST request.
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    // With httpsCallable, the data is in req.body.data
    const { items, customer } = req.body.data;
    // You'll need a unique key for idempotency. Using the user's UID plus a timestamp is not truly idempotent.
    // A better key would be the Firestore order ID, if you pass it from the client.
    const idempotencyKey = admin.firestore().collection('tmp').doc().id;

    if (!items || !customer) {
        return res.status(400).send({ error: { message: "Missing order or customer data in request." } });
    }

    try {
      const lineItems = items.map(item => ({
        name: item.name,
        quantity: item.quantity.toString(),
        basePriceMoney: {
          amount: item.price * 100, // Price in cents
          currency: "USD",
        },
      }));

      const response = await squareClient.checkoutApi.createPaymentLink({
        idempotencyKey: idempotencyKey,
        order: {
          locationId: "LFG29KHEV5M51", // Your Square Location ID
          lineItems: lineItems,
          customer_id: customer.id // If you have a customer ID in Square
        },
        checkoutOptions: {
          allowTipping: true,
          redirectUrl: "http://127.0.0.1:3000/success.html", // A page on your site for after payment.
                                                              // Make sure this is the correct URL for your success page.
        },
        prePopulatedData: {
          buyerEmail: customer.email,
          buyerPhoneNumber: customer.phone,
        }
      });
      
      // With onRequest, you send a JSON response back like this.
      // The 'data' wrapper is important for the client to parse it correctly.
      return res.status(200).send({
        data: {
            paymentUrl: response.result.paymentLink.url,
            orderId: response.result.paymentLink.orderId
        }
      });

    } catch (error) {
      console.error("Square API Error:", error);
      // Send a structured error response
      return res.status(500).send({ error: { message: "Failed to create payment link." } });
    }
  });
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