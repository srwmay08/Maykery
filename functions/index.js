const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Client, Environment } = require("square");
const sgMail = require("@sendgrid/mail");
const cors = require("cors")({origin: true});

admin.initializeApp();

const squareClient = new Client({
  environment: Environment.Sandbox,
  accessToken: functions.config().square.access_token,
});

sgMail.setApiKey(functions.config().sendgrid.api_key);

exports.createPaymentLink = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    console.log("createPaymentLink function triggered. Method:", req.method);

    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    try {
      const {items, customer} = req.body.data;
      const idempotencyKey = admin.firestore().collection("tmp").doc().id;

      if (!items || !customer) {
        console.error("Missing order or customer data in request.");
        return res.status(400).send({error: {message: "Missing order or customer data in request."}});
      }

      const lineItems = items.map((item) => ({
        name: item.name,
        quantity: item.quantity.toString(),
        basePriceMoney: {
          amount: item.price * 100,
          currency: "USD",
        },
      }));

      const response = await squareClient.checkoutApi.createPaymentLink({
        idempotencyKey: idempotencyKey,
        order: {
          locationId: "LFG29KHEV5M51",
          lineItems: lineItems,
        },
        checkoutOptions: {
          allowTipping: true,
          redirectUrl: "http://127.0.0.1:3000/success.html",
        },
        prePopulatedData: {
          buyerEmail: customer.email,
          buyerPhoneNumber: customer.phone,
        },
      });

      console.log("Successfully created payment link.");
      return res.status(200).send({
        data: {
          paymentUrl: response.result.paymentLink.url,
          orderId: response.result.paymentLink.orderId,
        },
      });
    } catch (error) {
      console.error("Error during function execution:", error);
      return res.status(500).send({error: {message: "Failed to create payment link."}});
    }
  });
});

exports.sendOrderConfirmationEmail = functions.firestore
    .document("orders/{orderId}")
    .onCreate((snap, context) => {
      const orderData = snap.data();

      const msg = {
        to: "sean@maykery.com",
        from: "noreply@yourdomain.com",
        subject: "New Pre-order Received!",
        html: `<p>You have a new order from ${orderData.customerName} for pickup on ${orderData.pickupDay}.</p>`,
      };

      return sgMail.send(msg);
    });