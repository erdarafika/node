const async = require('async')
const cron = require('node-cron')
const SHA256 = require("crypto-js/sha256")
var PouchDB = require("pouchdb")
PouchDB.plugin(require('pouchdb-find'))
var block = new PouchDB('blocks')
var txs = new PouchDB('txs')
var account = new PouchDB('account')
const io = require('socket.io-client')
const socket = io.connect('http://localhost:3000')

function recalculateHash(data) {
   return SHA256(data.height + data.previousBlockHash + data.txs + data.isMainNet + data.timeStamp).toString();
}

// txs.destroy().then(function (response) {
//   console.log(response);
// }).catch(function (err) {
//   console.log(err);
// })
//
// block.destroy().then(function (response) {
//   console.log(response);
// }).catch(function (err) {
//   console.log(err);
// })

block.createIndex({
   index: {
      fields: ['height', 'hash', 'previousBlockHash', 'timeStamp']
   }
}).then(function(result) {
   console.log(result);
}).catch(function(err) {
   console.log(err);
})

txs.createIndex({
   index: {
      fields: ['hash', 'timeStamp', 'isConfirmed']
   }
}).then(function(result) {
   console.log(result);
}).catch(function(err) {
   console.log(err);
})

// txs.find({
//    selector: {
//       timeStamp: {
//          '$gte': null
//       },
//       isConfirmed: false
//    },
//    fields: ['hash', 'data', 'timeStamp', 'isConfirmed'],
//    sort: [{
//       timeStamp: 'asc'
//    }],
//    use_index: ['_design/idx-8b941a80371d08e66a44ad17b13d63e3', 'idx-8b941a80371d08e66a44ad17b13d63e3']
// }).then(function(data) {
//    console.log(data);
// }).catch(function(err) {
//    console.log(err);
// })

// block.find({
//    selector: {
//       height: {
//          '$gte': null
//       }
//    },
//    sort: [{
//       height: 'desc'
//    }],
//    limit: 1
// }).then(function(data) {
//    console.log(data);
// }).catch(function(err) {
//    console.log(err);
// })


function sizeof(object) {
   /*

   sizeof.js

   A function to calculate the approximate memory usage of objects

   Created by Kate Morley - http://code.iamkate.com/ - and released under the terms
   of the CC0 1.0 Universal legal code:

   http://creativecommons.org/publicdomain/zero/1.0/legalcode

   */

   /* Returns the approximate memory usage, in bytes, of the specified object. The
    * parameter is:
    *
    * object - the object whose size should be determined
    */

   // initialise the list of objects and size
   var objects = [object];
   var size = 0;

   // loop over the objects
   for (var index = 0; index < objects.length; index++) {

      // determine the type of the object
      switch (typeof objects[index]) {

         // the object is a boolean
         case 'boolean':
            size += 4;
            break;

            // the object is a number
         case 'number':
            size += 8;
            break;

            // the object is a string
         case 'string':
            size += 2 * objects[index].length;
            break;

            // the object is a generic object
         case 'object':

            // if the object is not an array, add the sizes of the keys
            if (Object.prototype.toString.call(objects[index]) != '[object Array]') {
               for (var key in objects[index]) size += 2 * key.length;
            }

            // loop over the keys
            for (var key in objects[index]) {

               // determine whether the value has already been processed
               var processed = false;
               for (var search = 0; search < objects.length; search++) {
                  if (objects[search] === objects[index][key]) {
                     processed = true;
                     break;
                  }
               }

               // queue the value to be processed if appropriate
               if (!processed) objects.push(objects[index][key]);

            }

      }

   }

   // return the calculated size
   return size;

}

socket.on('syncblock', function(data) {
   for (var i = 0; i < data.docs.length; i++) {
      if (i == data.docs.length - 1) {
         break
      }
      if (data.docs[i].hash == recalculateHash(data.docs[i]) && data.docs[i].previousBlockHash == recalculateHash(data.docs[i + 1])) {
         delete data.docs[i]['_rev_tree']
         delete data.docs[i]['_rev']
         block.post(data.docs[i]).then(function(response) {

         }).catch(function(err) {

         });
      } else {
         break
      }
   }
})

socket.on('latestblock', function(data) {
   // console.log(data);
   const node_block = data
   block.find({
      selector: {
         height: {
            '$gte': null
         }
      },
      sort: [{
         height: 'desc'
      }],
      limit: 1
   }).then(function(doc) {
      if (doc.docs.length > 0 && node_block.length > 0) {
         if (doc.docs[0].height > node_block[0].height) {
            block.find({
               selector: {
                  height: {
                     '$gte': node_block[0].height
                  }
               },
               sort: [{
                  height: 'desc'
               }]
            }).then(function(docx) {
               socket.emit('upblock', docx)
            }).catch(function(err) {

            });
         }
         if (doc.docs[0].height < node_block[0].height) {
            var data = {
               height: node_block[0].height - 1
            }
            socket.emit('syncblock', data)
         }
      } else if (doc.docs.length == 0 && node_block.length > 0) {
        var data = {
           height: node_block[0].height - 1
        }
        socket.emit('syncblock', data)
      } else if (doc.docs.length > 0 && node_block.length == 0) {
        block.find({
           selector: {
              height: {
                 '$gte': doc.docs[0].height - 1
              }
           },
           sort: [{
              height: 'desc'
           }]
        }).then(function(syncdoc) {
          socket.emit('upblock', syncdoc)
        }).catch(function(err) {

        })
      }
   }).catch(function(err) {

   });
})

class Block {
   constructor(data, height, previousBlockHash, timeStamp) {
      if (typeof data == "object") {
         this.height = height
         this.hash = this.calculateHash()
         this.previousBlockHash = previousBlockHash
         this.txs = data.txs
         this.isMainNet = false
         this.timeStamp = timeStamp
      }
   }

   calculateHash() {
      return SHA256(this.height + this.previousBlockHash + this.txs + this.isMainNet + this.timeStamp).toString();
   }

}

class Transaction {
   constructor(data) {
      if (typeof data == "object") {
         this.hash = this.calculateHash()
         this.data = data.data
         this.isConfirmed = false
         this.timeStamp = (new Date).getTime()
      }
   }

   calculateHash() {
      return SHA256(this.data + true + this.timeStamp).toString();
   }

}

class Blockchain {
   addBlock(newBlock) {
      block.find({
         selector: {
            height: {
               '$gte': null
            }
         },
         sort: [{
            height: 'desc'
         }],
         limit: 1
      }).then(function(doc) {
         if (doc.docs.length > 0) {
           newBlock.height = doc.docs[0].height + 1
           newBlock.previousBlockHash = doc.docs[0].hash
           newBlock.hash = newBlock.calculateHash()
           newBlock._id = newBlock.calculateHash()
           // save block
           block.post(newBlock).then(function(response) {
              socket.emit('newblock', newBlock)
              // update tx
              for (var i = 0; i < newBlock.txs.length; i++) {
                 txs.get(newBlock.txs[i]).then(function(doc) {
                    doc.isConfirmed = true
                    return txs.put(doc)
                 }).then(function(response) {

                 }).catch(function(err) {

                 })
              }
           }).catch(function(err) {

           })
         }
         if (doc.docs.length == 0) {
           const height = 0
           newBlock.height = height
           newBlock.previousBlockHash = '0'
           newBlock.hash = newBlock.calculateHash()
           newBlock._id = newBlock.calculateHash()
           // save block
           block.post(newBlock).then(function(response) {
              socket.emit('newblock', newBlock)
              // update tx
              for (var i = 0; i < newBlock.txs.length; i++) {
                 txs.get(newBlock.txs[i]).then(function(doc) {
                    doc.isConfirmed = true
                    return txs.put(doc)
                 }).then(function(response) {

                 }).catch(function(err) {

                 })
              }
           }).catch(function(err) {

           })
         }
      }).catch(function(err) {
         // console.log(err);
         const height = 0
         newBlock.height = height
         newBlock.previousBlockHash = '0'
         newBlock.hash = newBlock.calculateHash()
         newBlock._id = newBlock.calculateHash()
         // save block
         block.post(newBlock).then(function(response) {
            socket.emit('newblock', newBlock)
            // update tx
            for (var i = 0; i < newBlock.txs.length; i++) {
               txs.get(newBlock.txs[i]).then(function(doc) {
                  doc.isConfirmed = true
                  return txs.put(doc)
               }).then(function(response) {

               }).catch(function(err) {

               })
            }
         }).catch(function(err) {

         })
      });
   }
}

class Tx {
   addTx(newTx) {
      newTx.hash = newTx.calculateHash()
      return newTx
   }
}

exports.add_tx = function(req, res, next) {
   let transaction = new Tx();
   var data = req.body
   if (typeof data == "object") {
      var objsize = sizeof(data)
      if (objsize > 7168) {
         return res.status(400).json({
            code: 400,
            message: "Object must be below 7kb"
         })
      } else {
         var tx = transaction.addTx(new Transaction(data))
         tx._id = tx.hash
         txs.post(tx).then(function(response) {
            return res.status(200).json({
               code: 200,
               block: tx
            })
         }).catch(function(err) {
            return res.status(err.status).json({
               code: err.status,
               message: err.name
            })
         })
      }
   } else {
      return res.status(400).json({
         code: 400,
         message: "Data must be an object."
      })
   }
}

// mine block every 1 minutes
cron.schedule('* * * * *', function() {
   txs.find({
      selector: {
         timeStamp: {
            '$gte': null
         },
         isConfirmed: false
      }
   }).then(function(data) {
      if (data.docs.length > 0) {
         let blockchain = new Blockchain();
         var txs = data.docs.map(value => (value.hash))
         var data = {
            txs: txs
         }
         blockchain.addBlock(new Block(data, 1, '0', (new Date).getTime()))
      }
   }).catch(function(err) {
      console.log(err);
   })
})

exports.get_tx = function(req, res, next) {
   var tx = req.params.hash
   if (tx) {
      txs.get(tx).then(function(doc) {
         delete doc['_id']
         delete doc['_rev']
         return res.status(200).json({
            code: 200,
            block: doc
         })
      }).catch(function(err) {
         return res.status(err.status).json({
            code: err.status,
            message: err.name
         })
      });
   } else {
      return res.status(400).json({
         code: 400,
         message: "Tx hash is required."
      })
   }
}

exports.get_pending_tx = function(req, res, next) {
   txs.find({
      selector: {
         timeStamp: {
            '$gte': null
         },
         isConfirmed: false
      }
   }).then(function(data) {
      return res.status(200).json({
         code: 200,
         block: data.docs
      })
   }).catch(function(err) {
      return res.status(err.status).json({
         code: err.status,
         message: err.name
      })
   })
}

exports.get_block_hash = function(req, res, next) {
   var hash = req.params.hash
   if (hash) {
      block.get(hash).then(function(doc) {
         delete doc['_id']
         delete doc['_rev']
         return res.status(200).json({
            code: 200,
            block: doc
         })
      }).catch(function(err) {
         return res.status(err.status).json({
            code: err.status,
            message: err.name
         })
      })
   } else {
      return res.status(400).json({
         code: 400,
         message: "Block hash is required."
      })
   }
}

exports.get_block_height = function(req, res, next) {
   const height = req.params.index
   if (height) {
      block.find({
         selector: {
            height: parseInt(height)
         }
      }).then(function(docx) {
         return res.status(200).json({
            code: 200,
            block: docx.docs[0]
         })
      }).catch(function(err) {
         return res.status(err.status).json({
            code: err.status,
            message: err.name
         })
      })
   } else {
      return res.status(400).json({
         code: 400,
         message: "Block height is required."
      })
   }
}

exports.get_index = function(req, res, next) {
  txs.getIndexes().then(function (result) {
    return res.status(200).json({
       code: 200,
       data: result
    })
  }).catch(function (err) {
    return res.status(err.status).json({
       code: err.status,
       message: err.name
    })
  })
}
