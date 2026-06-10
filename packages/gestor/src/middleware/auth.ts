import { NextFunction, Request, Response } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    res.redirect("/login");
    return;
  }
  next();
}

export function exposeLocals(req: Request, res: Response, next: NextFunction) {
  res.locals.user = req.session.user ?? null;
  res.locals.currentPath = req.path;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
}
