const fontMock = () => ({
  className: "className",
  variable: "variable",
  style: { fontFamily: "fontFamily" },
});

module.exports = new Proxy(fontMock, {
  get: function (_target, property) {
    if (property === "__esModule") return false;
    return fontMock;
  },
});
