  import bodyParser from "body-parser";
  import express, { Request, Response } from "express";
  import { REGISTRY_PORT } from "../config";

  export type Node = { nodeId: number; pubKey: string };

  export type RegisterNodeBody = {
    nodeId: number;
    pubKey: string;
  };

  export type GetNodeRegistryBody = {
    nodes: Node[];
  };

  const nodesRegistry: Node[] = []; // Stores registered nodes

  export async function launchRegistry() {
    const _registry = express();
    _registry.use(express.json());
    _registry.use(bodyParser.json());

    // Implementing the status route
    _registry.get("/status", (req, res) => {
      res.send("live");
    });

    // POST /registerNode - Registers a node
    _registry.post("/registerNode", (req, res) => {
      const { nodeId, pubKey } = req.body as RegisterNodeBody;

      if (nodeId === undefined || pubKey === undefined || pubKey === "") {
        return res.status(400).json({ error: "Missing nodeId or pubKey" });
      }

      // Prevent duplicate registrations
      if (nodesRegistry.some((node) => node.nodeId === nodeId)) {
        return res.status(400).json({ error: "Node already registered" });
      }

      // Register node
      nodesRegistry.push({ nodeId, pubKey });
      return res.json({ success: true });
    });

    _registry.get("/getNodeRegistry", (req, res) => {
      const response: GetNodeRegistryBody = { nodes: nodesRegistry };
      res.json(response);
    });

    const server = _registry.listen(REGISTRY_PORT, () => {
      console.log(`registry is listening on port ${REGISTRY_PORT}`);
    });

    return server;
  }
