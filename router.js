const express = require('express')
const Blockchain = require('./controllers/blockchain')

module.exports = function (app) {
  const root = express.Router()
  const block = express.Router()
  app.use('/', root)
  root.get('/', (req, res) => {
    return res.status(200).json({
      code: 200, message: 'CHAIN v.0.0.1'
    })
  })

  app.use(function(req, res, next) {
    return res.status(404).json({
      code: 404, message: '404 Resource not found.'
    })
  })

  root.use('/api', block)
  block.get('/index', Blockchain.get_index)
  block.get('/block/:hash', Blockchain.get_block_hash)
  block.get('/height/:index', Blockchain.get_block_height)
  block.post('/new-tx', Blockchain.add_tx)
  block.get('/pending-tx', Blockchain.get_pending_tx)
  block.get('/tx/:hash', Blockchain.get_tx)
}
