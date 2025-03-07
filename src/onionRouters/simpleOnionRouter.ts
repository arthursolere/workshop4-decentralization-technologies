import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { generateRsaKeyPair, exportPubKey, exportPrvKey } from "../crypto";

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  // Store last message details
  let lastReceivedEncryptedMessage: string | null = null;
  let lastReceivedDecryptedMessage: string | null = null;
  let lastMessageDestination: number | null = null;

  // Generate RSA key pair
  const { publicKey, privateKey } = await generateRsaKeyPair();
  const publicKeyBase64 = await exportPubKey(publicKey);
  const privateKeyBase64 = await exportPrvKey(privateKey);

  // Implementing the status route
  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });

  onionRouter.get("/getPrivateKey", async (req, res) => {
    try {
      const exportedPrivateKey = await exportPrvKey(privateKey);
      console.log(`🔑 Private Key for node ${nodeId}:`, exportedPrivateKey); // Debugging log
      res.json({ result: exportedPrivateKey });
    } catch (error) {
      console.error(`❌ Error exporting private key for node ${nodeId}:`, error);
      res.status(500).json({ error: "Failed to export private key" });
    }
  });

  // GET routes for retrieving messages
  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.json({ result: lastReceivedDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.json({ result: lastMessageDestination });
  });

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, async () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );

    // Register node to the registry
    try {
      const response = await fetch(`http://localhost:${REGISTRY_PORT}/registerNode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId,
          pubKey: publicKeyBase64,
        }),
      });

      if (!response.ok) {
        console.error(`Error registering node ${nodeId}:`, await response.text());
      } else {
        console.log(`Node ${nodeId} registered successfully.`);
      }
    } catch (error) {
      console.error(`Error registering node ${nodeId}:`, error);
    }
  });

  return server;
}
