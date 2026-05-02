if (import.meta.env.PROD) {
  console.log = () => undefined;
  console.debug = () => undefined;
  console.info = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;
}
