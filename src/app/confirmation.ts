export const requestConfirmation = (message: string): Promise<boolean> =>
  new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent("request-confirmation", { detail: { message, resolve } }));
  });
