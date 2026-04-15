let app: any;

try {
  const { createApp } = await import("../src/app");
  app = createApp();
} catch (err: any) {
  // Fallback: retorna o erro completo para debug
  app = (_req: any, res: any) => {
    res.status(500).json({
      error: "Failed to load app module",
      message: err?.message,
      stack: err?.stack,
    });
  };
}

export default app;
