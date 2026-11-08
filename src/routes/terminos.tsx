// HND-061: términos de uso. Página pública. Deja claro que los puntos no son efectivo.
import { createFileRoute, Link } from "@tanstack/react-router";
import { PaginaLegal } from "@/components/enlaces-legales";
import { VERSION_TERMINOS } from "@/lib/legal";
import { pageMeta } from "@/lib/metadata";

export const Route = createFileRoute("/terminos")({
  head: () =>
    pageMeta(
      "Términos de uso",
      "Reglas para usar Handle: cobros CoDi, programa de puntos (que no son dinero) y responsabilidades.",
    ),
  component: TerminosDeUso,
});

function TerminosDeUso() {
  return (
    <PaginaLegal titulo="Términos de uso" version={VERSION_TERMINOS}>
      <section>
        <h2>1. Qué es Handle</h2>
        <p>
          Handle es una herramienta para negocios de barrio: permite generar cobros CoDi, llevar un programa de puntos
          para sus clientes y aparecer en un mapa de negocios afiliados. Al crear una cuenta aceptas estos términos y
          el{" "}
          <Link to="/privacidad" className="font-medium underline underline-offset-2">
            aviso de privacidad
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>2. Cobros</h2>
        <ul>
          <li>
            Los pagos se procesan a través de un procesador de pagos autorizado (Pey) y de CoDi. Handle no recibe,
            guarda ni custodia el dinero de los cobros: el pago va directo a la cuenta bancaria del negocio.
          </li>
          <li>
            Un cobro se considera pagado solo cuando el procesador lo confirma. Los cobros sin pagar se vencen y se
            pueden cancelar.
          </li>
          <li>
            El negocio es responsable de los productos que vende, de sus precios y de emitir los comprobantes fiscales
            que correspondan.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Los puntos no son dinero</h2>
        <ul>
          <li>
            <strong>Los puntos no son efectivo, no tienen valor monetario y no son un depósito.</strong> Son un
            descuento que otorga cada negocio a sus clientes.
          </li>
          <li>
            1 punto equivale a $1 MXN de descuento y solo se puede usar en el negocio donde se ganó.
          </li>
          <li>
            Los puntos <strong>no se pueden retirar, cambiar por dinero, transferir ni vender</strong>.
          </li>
          <li>
            Cada negocio define cuántos puntos da por compra y el máximo de descuento por compra; siempre queda una
            parte por pagar.
          </li>
          <li>
            El saldo de un negocio vence si pasas el periodo de inactividad que ese negocio fijó sin comprar ni
            canjear ahí. Los puntos reservados en un cobro que se cancela o vence se devuelven.
          </li>
          <li>
            Si un negocio deja la red o su programa termina, sus puntos dejan de poder usarse.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Negocios afiliados</h2>
        <ul>
          <li>
            Para cobrar, el negocio debe entregar información y documentos verídicos para su validación (KYB). Handle
            puede rechazar o dar de baja a un negocio con información falsa o actividad sospechosa.
          </li>
          <li>
            El nombre comercial, la categoría, la dirección y el horario de un negocio aprobado se publican en el mapa
            público de Handle.
          </li>
          <li>
            El dueño es responsable de las personas de su equipo a las que da acceso y de darlas de baja cuando dejen
            de trabajar con él.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Uso correcto</h2>
        <p>
          No uses Handle para actividades ilícitas, para generar cobros sin una venta real ni para obtener puntos de
          forma fraudulenta. Podemos suspender cuentas que incumplan estos términos.
        </p>
      </section>

      <section>
        <h2>6. Disponibilidad y responsabilidad</h2>
        <p>
          Hacemos lo posible por que Handle funcione todo el tiempo, pero puede haber interrupciones por mantenimiento
          o por fallas de terceros (procesador de pagos, bancos o proveedores de internet). Handle no responde por
          pagos que el procesador o el banco no confirmen.
        </p>
      </section>

      <section>
        <h2>7. Cambios</h2>
        <p>
          Podemos actualizar estos términos. Publicaremos la nueva versión en esta página con su fecha y, si el cambio
          es importante, te pediremos aceptarla de nuevo. Estos términos se rigen por las leyes de los Estados Unidos
          Mexicanos.
        </p>
      </section>
    </PaginaLegal>
  );
}
