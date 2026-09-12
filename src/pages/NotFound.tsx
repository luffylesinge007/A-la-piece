import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex min-h-screen flex-col bg-background"
    >
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <p className="font-display text-7xl font-extrabold tracking-tight text-primary">404</p>
          <h1 className="mt-3 font-display text-xl font-bold">Cette page n'existe pas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Le lien est peut-être incorrect, ou la page a été déplacée.
            Pas d'inquiétude — tes missions t'attendent toujours.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/accueil"><Home className="size-4" /> Retour à l'accueil</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/missions"><Compass className="size-4" /> Explorer les missions</Link>
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
