import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import {
  createRandomSymmetricKey,
  exportSymKey,
  rsaEncrypt,
  symEncrypt
} from "../crypto";
import {GetNodeRegistryBody} from "@/src/registry/registry";


export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  // Store last message details
  let lastReceivedMessage: string | null = null;
  let lastSentMessage: string | null = null;

  // Implementing the status route
  _user.get("/status", (req, res) => {
    res.send("live");
  });

  // GET routes for retrieving messages
  _user.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });

  // POST /message - Receive a new message
  _user.post("/message", (req, res) => {
    const { message } = req.body;

    if (!message) {
      return res.status(400).send("Missing message");
    }

    // Update last received message
    lastReceivedMessage = message;
    console.log(`📩 User ${userId} received message: ${message}`);

    return res.send("success"); // ✅ Return plain string instead of JSON
  });

  // ✅ Implementing /sendMessage route
  _user.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body;

    if (!message || destinationUserId === undefined) {
      return res.status(400).json({ error: "Missing message or destinationUserId" });
    }

    try {
      // Step 1: Retrieve the registry to get available nodes
      const registryResponse = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
      const registryData = await registryResponse.json() as GetNodeRegistryBody;
      const availableNodes = registryData.nodes;
      if (availableNodes.length < 3) {
        return res.status(500).json({ error: "Not enough nodes in the network" });
      }

      // Step 2: Randomly select 3 distinct nodes
      const selectedNodes = availableNodes.sort(() => 0.5 - Math.random()).slice(0, 3);

      // Step 3: Generate symmetric keys for each node
      const symmetricKeys = await Promise.all(selectedNodes.map(() => createRandomSymmetricKey()));

      // Step 4: Encrypt the message in layers (onion encryption)
      let encryptedPayload = message;
      let nextDestination = String(BASE_USER_PORT + destinationUserId).padStart(10, "0");

      for (let i = selectedNodes.length - 1; i >= 0; i--) {
        const node = selectedNodes[i];
        const symmetricKey = symmetricKeys[i];

        // Encrypt the next destination + message using the symmetric key
        const encryptedLayer = await symEncrypt(symmetricKey, nextDestination + encryptedPayload);

        // Encrypt the symmetric key using the node's RSA public key
        const encryptedKey = await rsaEncrypt(await exportSymKey(symmetricKey), node.pubKey);

        // Concatenate (2) encrypted key + (1) encrypted data
        encryptedPayload = encryptedKey + encryptedLayer;

        // Set the next destination as this node
        nextDestination = String(BASE_ONION_ROUTER_PORT + node.nodeId).padStart(10, "0");
      }

      // Step 5: Send the final encrypted message to the entry node
      const entryNode = selectedNodes[0];
      const entryNodePort = BASE_ONION_ROUTER_PORT + entryNode.nodeId;

      const response = await fetch(`http://localhost:${entryNodePort}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: encryptedPayload }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message to entry node: ${response.statusText}`);
      }

      // Update last sent message
      lastSentMessage = message;
      console.log(`📨 User ${userId} sent message: ${message}`);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error(`Error in /sendMessage: ${error}`);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}
