// HND-061: aviso de privacidad integral (LFPDPPP). Página pública.
import { createFileRoute, Link } from "@tanstack/react-router";
import { PaginaLegal } from "@/components/enlaces-legales";
import { RESPONSABLE, VERSION_PRIVACIDAD } from "@/lib/legal";
import { pageMeta } from "@/lib/metadata";

export const Route = createFileRoute("/privacidad")({
  head: () =>
    pageMeta(
      "Aviso de privacidad",
      "Cómo Handle trata los datos personales de negocios, su equipo y sus clientes, conforme a la LFPDPPP.",
    ),
  component: AvisoDePrivacidad,
});

function AvisoDePrivacidad() {
  return (
    <PaginaLegal titulo="Aviso de privacidad" version={VERSION_PRIVACIDAD}>
      <section>
        <h2>1. Quién es responsable de tus datos</h2>
        <p>
          {RESPONSABLE.nombre} (en adelante, “Handle”), con domicilio en {RESPONSABLE.domicilio}, es responsable
          del tratamiento de tus datos personales conforme a la Ley Federal de Protección de Datos Personales en
          Posesión de los Particulares (LFPDPPP), su Reglamento y los Lineamientos del Aviso de Privacidad.
        </p>
        <p>Contacto para temas de privacidad: {RESPONSABLE.correo}.</p>
      </section>

      <section>
        <h2>2. Qué datos tratamos</h2>
        <p>Según cómo uses Handle:</p>
        <ul>
          <li>
            <strong>Clientes:</strong> nombre, correo electrónico, compras realizadas en negocios afiliados (monto,
            fecha y negocio), puntos ganados y canjeados, y nivel de cliente.
          </li>
          <li>
            <strong>Dueños y representantes de negocios:</strong> nombre, correo, teléfono, RFC, CURP, razón social,
            domicilio del negocio y código postal, identificación oficial (INE), constancia de situación fiscal,
            comprobante de domicilio del negocio y estado de cuenta bancario (titular y CLABE).
          </li>
          <li>
            <strong>Personal del negocio (cajeros y administradores):</strong> nombre, correo y rol dentro del
            negocio.
          </li>
          <li>
            <strong>Datos de uso:</strong> registros técnicos de acceso y de operación necesarios para la seguridad
            del servicio.
          </li>
        </ul>
        <p>
          Handle <strong>no</strong> solicita datos personales sensibles. La identificación oficial y los documentos
          fiscales y bancarios se piden solo para validar al negocio (KYB) y se guardan en un almacenamiento privado.
        </p>
      </section>

      <section>
        <h2>3. Para qué los usamos</h2>
        <p>Finalidades necesarias para darte el servicio:</p>
        <ul>
          <li>Crear y administrar tu cuenta y darte acceso con un enlace a tu correo.</li>
          <li>Validar la identidad y la información fiscal y bancaria de los negocios afiliados.</li>
          <li>Generar cobros CoDi y conciliarlos con el procesador de pagos.</li>
          <li>Calcular, registrar, canjear y vencer puntos de lealtad y niveles de cliente.</li>
          <li>Mostrar los negocios aprobados en el mapa público (nombre comercial, categoría, dirección y horario).</li>
          <li>Prevenir fraudes, atender aclaraciones y cumplir obligaciones legales.</li>
        </ul>
        <p>Finalidades secundarias (puedes negarte sin perder el servicio):</p>
        <ul>
          <li>Enviarte avisos sobre promociones de los negocios donde compras.</li>
          <li>Generar estadísticas agregadas para mejorar Handle.</li>
        </ul>
        <p>
          Si no quieres que usemos tus datos para las finalidades secundarias, escríbenos al contacto de privacidad.
        </p>
      </section>

      <section>
        <h2>4. Con quién compartimos tus datos</h2>
        <ul>
          <li>
            <strong>Procesador de pagos (Pey):</strong> datos del cobro y de la cuenta CoDi del negocio, para procesar
            los pagos.
          </li>
          <li>
            <strong>Negocios afiliados:</strong> el negocio donde compras ve tu nombre, tu nivel y tu saldo de puntos
            en ese negocio, para aplicar tus descuentos.
          </li>
          <li>
            <strong>Autoridades competentes:</strong> cuando una ley o una orden de autoridad lo exija.
          </li>
        </ul>
        <p>
          También usamos proveedores que tratan datos por cuenta de Handle (alojamiento y base de datos, envío de
          correos, geocodificación de la dirección del negocio y servicios de inteligencia artificial para el
          asistente del negocio). Estas remisiones no requieren tu consentimiento. Handle no vende tus datos.
        </p>
      </section>

      <section>
        <h2>5. Tus derechos ARCO y cómo revocar tu consentimiento</h2>
        <p>
          Puedes <strong>acceder</strong> a tus datos, <strong>rectificarlos</strong>, <strong>cancelarlos</strong> u{" "}
          <strong>oponerte</strong> a su uso (derechos ARCO), así como revocar tu consentimiento o limitar el uso de tus
          datos. Envía tu solicitud al contacto de privacidad con: tu nombre, el correo de tu cuenta, una
          identificación, qué derecho quieres ejercer y sobre qué datos.
        </p>
        <p>
          Responderemos en un máximo de 20 días hábiles y, si procede, haremos efectiva tu solicitud dentro de los 15
          días hábiles siguientes. Algunos registros (por ejemplo, los movimientos de cobro y de puntos) deben
          conservarse por obligaciones legales y contables aunque canceles tu cuenta.
        </p>
      </section>

      <section>
        <h2>6. Cookies y almacenamiento local</h2>
        <p>
          Handle guarda en tu navegador la sesión iniciada y tus preferencias de pantalla (por ejemplo, el tema
          claro u oscuro). No usamos cookies de publicidad. Puedes borrarlas desde tu navegador; tendrás que volver a
          entrar con tu correo.
        </p>
      </section>

      <section>
        <h2>7. Cambios a este aviso</h2>
        <p>
          Si cambiamos este aviso lo publicaremos en esta página con una nueva fecha de actualización. Si el cambio
          afecta las finalidades necesarias, te pediremos aceptarlo de nuevo. Consulta también los{" "}
          <Link to="/terminos" className="font-medium underline underline-offset-2">
            términos de uso
          </Link>
          .
        </p>
        <p>
          Si consideras que tu derecho a la protección de datos fue vulnerado, puedes acudir a la autoridad
          competente en materia de protección de datos personales.
        </p>
      </section>
    </PaginaLegal>
  );
}
