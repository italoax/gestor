import { Router } from "express";

export const placeholderRouter = Router();

const RECURSOS: Record<string, { titulo: string; icon: string; descricao: string }> = {
  testes: { titulo: "Testes", icon: "🧪", descricao: "Crie e acompanhe testes gratuitos para novos clientes." },
};

placeholderRouter.get("/em-breve/:slug", (req, res) => {
  const slug = String(req.params.slug ?? "").toLowerCase();
  const recurso = RECURSOS[slug] ?? { titulo: "Em breve", icon: "🚧", descricao: "Este recurso está em desenvolvimento." };
  res.render("pages/em-breve", { title: recurso.titulo, recurso });
});
