import { Router } from "express";

export const placeholderRouter = Router();

placeholderRouter.get("/em-breve/:slug", (req, res) => {
  const slug = String(req.params.slug ?? "").toLowerCase();
  if (slug === "testes") return res.redirect("/dashboard");
  const recurso = { titulo: "Em breve", icon: "🚧", descricao: "Este recurso está em desenvolvimento." };
  res.render("pages/em-breve", { title: recurso.titulo, recurso });
});
