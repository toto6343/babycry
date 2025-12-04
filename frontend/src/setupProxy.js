const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Node.js 백엔드 프록시 (port 4000)
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:4000',
      changeOrigin: true,
      onProxyReq: (proxyReq, req, res) => {
        // Authorization 헤더 명시적으로 전달
        if (req.headers.authorization) {
          proxyReq.setHeader('Authorization', req.headers.authorization);
        }
        console.log('🔄 [Proxy → Node] ' + req.method + ' ' + req.url);
      }
    })
  );

  // Python 백엔드 프록시 (port 5000) - 필요시
  app.use(
    '/python-api',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      pathRewrite: {
        '^/python-api': '', // /python-api/xxx → /xxx
      },
      onProxyReq: (proxyReq, req, res) => {
        console.log('🔄 [Proxy → Python] ' + req.method + ' ' + req.url);
      }
    })
  );
};
