import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import {
  esRutaPublica,
  inicioPorRol,
  marcoPorRol,
  puedeEntrar,
  reglaDeRuta,
  type Rol,
} from "@/lib/roles";
import { routeTree } from "@/routeTree.gen";

const TODOS: Rol[] = ["owner", "admin", "finance", "hr", "sales", "cajero", "admin_red", "cliente"];

describe("inicioPorRol", () => {
  it("manda a cada rol a su pantalla", () => {
    expect(inicioPorRol("cajero")).toBe("/caja");
    expect(inicioPorRol("cliente")).toBe("/monedero");
    expect(inicioPorRol("admin_red")).toBe("/red");
  });

  it("manda al dashboard a la gerencia y oficina", () => {
    for (const rol of ["owner", "admin", "finance", "hr", "sales"]) {
      expect(inicioPorRol(rol)).toBe("/dashboard");
    }
  });

  it("usa el dashboard si el rol es desconocido o falta", () => {
    expect(inicioPorRol(undefined)).toBe("/dashboard");
    expect(inicioPorRol(null)).toBe("/dashboard");
    expect(inicioPorRol("otro")).toBe("/dashboard");
  });

  it("nunca deja a un rol atrapado: su inicio siempre le está permitido", () => {
    // Si no, la guarda lo redirigiría a su inicio una y otra vez.
    for (const rol of TODOS) expect(puedeEntrar(rol, inicioPorRol(rol)), rol).toBe(true);
  });
});

describe("puedeEntrar", () => {
  it("cajero: solo caja y configuración", () => {
    expect(puedeEntrar("cajero", "/caja")).toBe(true);
    expect(puedeEntrar("cajero", "/configuracion")).toBe(true);
    for (const ruta of [
      "/dashboard",
      "/finanzas",
      "/clientes",
      "/colaboradores",
      "/pagos",
      "/api",
      "/red",
      "/monedero",
    ]) {
      expect(puedeEntrar("cajero", ruta), ruta).toBe(false);
    }
  });

  it("cliente: solo su monedero", () => {
    expect(puedeEntrar("cliente", "/monedero")).toBe(true);
    for (const ruta of ["/dashboard", "/caja", "/configuracion", "/red", "/api"]) {
      expect(puedeEntrar("cliente", ruta), ruta).toBe(false);
    }
  });

  it("admin de red: la red y configuración, no el ERP de los negocios", () => {
    expect(puedeEntrar("admin_red", "/red")).toBe(true);
    expect(puedeEntrar("admin_red", "/configuracion")).toBe(true);
    for (const ruta of ["/dashboard", "/finanzas", "/caja", "/api"]) {
      expect(puedeEntrar("admin_red", ruta), ruta).toBe(false);
    }
  });

  it("dueño: todo su negocio, pero no la red ni el monedero de clientes", () => {
    for (const ruta of [
      "/dashboard",
      "/finanzas",
      "/pagos",
      "/clientes",
      "/colaboradores",
      "/api",
      "/caja",
      "/configuracion",
    ]) {
      expect(puedeEntrar("owner", ruta), ruta).toBe(true);
    }
    expect(puedeEntrar("owner", "/red")).toBe(false);
    expect(puedeEntrar("owner", "/monedero")).toBe(false);
  });

  it("KYB: el expediente lo llena la gerencia y lo revisa solo la red", () => {
    expect(puedeEntrar("owner", "/negocio")).toBe(true);
    expect(puedeEntrar("admin", "/negocio")).toBe(true);
    expect(puedeEntrar("cajero", "/negocio")).toBe(false);
    expect(puedeEntrar("finance", "/negocio")).toBe(false);
    expect(puedeEntrar("admin_red", "/negocio")).toBe(false);
    expect(puedeEntrar("admin_red", "/red/123")).toBe(true);
    expect(puedeEntrar("owner", "/red/123")).toBe(false);
  });

  it("finanzas no gestiona API keys", () => {
    expect(puedeEntrar("finance", "/finanzas")).toBe(true);
    expect(puedeEntrar("finance", "/api")).toBe(false);
  });

  it("las subrutas siguen la regla de su sección", () => {
    expect(puedeEntrar("owner", "/clientes/123")).toBe(true);
    expect(puedeEntrar("cajero", "/clientes/123")).toBe(false);
    expect(puedeEntrar("owner", "/clientes/")).toBe(true);
  });

  it("no confunde secciones con nombres parecidos", () => {
    expect(reglaDeRuta("/cajas")).toBeUndefined();
    expect(reglaDeRuta("/redes")).toBeUndefined();
  });

  it("niega por defecto lo que no tiene regla o si no hay rol", () => {
    expect(puedeEntrar("owner", "/secreto")).toBe(false);
    expect(puedeEntrar(undefined, "/dashboard")).toBe(false);
    expect(puedeEntrar("otro", "/dashboard")).toBe(false);
  });
});

describe("marcoPorRol", () => {
  it("cajero y cliente usan el marco simple para celular", () => {
    expect(marcoPorRol("cajero")).toBe("simple");
    expect(marcoPorRol("cliente")).toBe("simple");
  });

  it("gerencia, oficina y red usan el marco de oficina", () => {
    for (const rol of ["owner", "admin", "finance", "hr", "sales", "admin_red"]) {
      expect(marcoPorRol(rol), rol).toBe("oficina");
    }
  });

  it("sin rol, usa el de oficina", () => {
    expect(marcoPorRol(undefined)).toBe("oficina");
  });
});

describe("cobertura de rutas", () => {
  it("toda pantalla privada de la app tiene una regla de acceso", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const privadas = Object.values(router.routesById)
      .filter((r) => r.id.startsWith("/_authenticated/"))
      .map((r) => r.fullPath);

    expect(privadas.length).toBeGreaterThan(0);
    const sinRegla = privadas.filter((ruta) => !reglaDeRuta(ruta));
    expect(
      sinRegla,
      `Rutas privadas sin regla en src/lib/roles.ts: ${sinRegla.join(", ")}`,
    ).toEqual([]);
  });

  it("toda pantalla fuera de la sesión está declarada como pública", () => {
    // Las rutas /api/* son endpoints de servidor con su propia autenticación (API key o firma).
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const publicas = Object.values(router.routesById)
      .filter(
        (r) =>
          r.id !== "__root__" &&
          r.id !== "/_authenticated" &&
          !r.id.startsWith("/_authenticated/") &&
          !r.id.startsWith("/api/"),
      )
      .map((r) => r.fullPath);

    expect(publicas).toContain("/mapa/");
    const sinDeclarar = publicas.filter((ruta) => !esRutaPublica(ruta));
    expect(
      sinDeclarar,
      `Rutas públicas no declaradas en RUTAS_PUBLICAS (src/lib/roles.ts): ${sinDeclarar.join(", ")}`,
    ).toEqual([]);
  });
});

describe("esRutaPublica", () => {
  it("el mapa y el perfil de negocio son públicos", () => {
    expect(esRutaPublica("/mapa")).toBe(true);
    expect(esRutaPublica("/mapa/")).toBe(true);
    expect(esRutaPublica("/mapa/123")).toBe(true);
    expect(esRutaPublica("/")).toBe(true);
    expect(esRutaPublica("/auth")).toBe(true);
  });

  it("niega por defecto: lo privado y lo desconocido no es público", () => {
    for (const ruta of [
      "/dashboard",
      "/red",
      "/negocio",
      "/caja",
      "/monedero",
      "/mapas",
      "/secreto",
    ]) {
      expect(esRutaPublica(ruta), ruta).toBe(false);
    }
  });

  it("ninguna ruta es pública y privada a la vez", () => {
    for (const ruta of ["/", "/auth", "/mapa", "/mapa/123"]) {
      expect(reglaDeRuta(ruta), ruta).toBeUndefined();
    }
  });
});
