// Adapted from ecommerce-react i18n: same i18next/react-i18next infrastructure, French first.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
void i18n.use(initReactI18next).init({
  lng: "fr",
  fallbackLng: "fr",
  resources: {
    fr: {
      translation: {
        shop: "Boutique",
        cart: "Panier",
        account: "Mon compte",
        add: "Ajouter",
      },
    },
    en: {
      translation: {
        shop: "Shop",
        cart: "Cart",
        account: "Account",
        add: "Add",
      },
    },
  },
  interpolation: { escapeValue: false },
});
export default i18n;
