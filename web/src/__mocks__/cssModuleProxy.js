// Mirrors identity-obj-proxy: accessing styles.myClass returns "myClass"
module.exports = new Proxy(
  {},
  {
    get: function (_target, key) {
      if (key === "__esModule") return false;
      return key;
    },
  },
);
