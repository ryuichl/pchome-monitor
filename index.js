;(async () => {
    try {
        require('dotenv').config()
        const db_des = './db/pchome.json'
        let db = require(db_des)
        const got = require('got')
        const CronJob = require('cron').CronJob
        const argv = require('yargs').argv
        const Promise = require('bluebird')
        const urlparse = require('url-parse')
        const moment = require('moment-timezone')
        const fs = require('fs-extra')

        const pchome_handlers = require('./handlers/pchome')

        const store_urls = process.env.store_url.split(',')

        const sleep = (time) => {
            return new Promise((resolve) => setTimeout(resolve, time))
        }
        const pchome_store_id = (url) => {
            const path = urlparse(url).pathname.split('/')
            const store_id = path[path.length - 1]
            return store_id
        }
        const pchome_prod_url = (prod_id) => {
            return `https://24h.pchome.com.tw/prod/${prod_id}`
        }
        const get_prod_id = async () => {
            const prods = await Promise.reduce(
                store_urls,
                async (array, store_url) => {
                    const { totalRows, totalPage } = await pchome_handlers.store_search(pchome_store_id(store_url))
                    const prods = await Promise.reduce(
                        [...Array(totalPage)],
                        async (array, _array, index) => {
                            let { prods } = await pchome_handlers.store_search(pchome_store_id(store_url), undefined, undefined, index + 1)
                            prods = prods.map((prod) => {
                                return prod.Id
                            })
                            return array.concat(prods)
                        },
                        []
                    )
                    return array.concat(prods)
                },
                []
            )
            return prods
        }
        const message_template = (status, prod) => {
            const message =
                status +
                '\n' +
                '時間 : ' +
                moment().tz('Asia/Taipei').format('YYYY/MM/DD HH:mm:ss') +
                '\n' +
                '品項 : ' +
                prod.Name +
                '\n' +
                '價格 : ' +
                prod.Price.P +
                '\n' +
                '數量 : ' +
                prod.Qty +
                '\n' +
                '按鈕 : ' +
                prod.ButtonType +
                '\n' +
                '網址 : ' +
                pchome_prod_url(prod.Id)
            return message
        }
        const line_notify = async (message) => {
            let options = {
                method: 'POST',
                url: 'https://notify-api.line.me/api/notify',
                headers: {},
                form: {
                    message: message
                },
                responseType: 'json',
                resolveBodyOnly: true
            }
            options.headers.Authorization = `Bearer ${process.env.line_notify}`
            return got(options)
        }
        const inspect = async () => {
            const prod_ids = Object.keys(db)
            const new_infos = await pchome_handlers.button_info(prod_ids.join(','))
            await sleep(2000)
            await Promise.map(new_infos, async (new_info) => {
                const prod_id = new_info.Id
                if (!db[prod_id]) {
                    return true
                }
                const old_info = Object.assign({}, db[prod_id])
                db[prod_id].Qty = new_info.Qty
                db[prod_id].Price = new_info.Price
                db[prod_id].ButtonType = new_info.ButtonType
                db[prod_id].SaleStatus = new_info.SaleStatus
                if (new_info.Qty > old_info.Qty) {
                    console.log(`商品進貨 ${old_info.Name}`)
                    await line_notify(message_template('商品進貨', db[prod_id]))
                } else if (new_info.Qty === 0 && old_info.Qty !== 0) {
                    console.log(`商品售完 ${old_info.Name}`)
                    await line_notify(message_template('商品售完', db[prod_id]))
                } else if (new_info.ButtonType !== old_info.ButtonType) {
                    console.log(`狀態改變 ${old_info.Name}`)
                    await line_notify(message_template('狀態改變', db[prod_id]))
                }
                await fs.outputJson(db_des, db)
            })
            const store_prod_ids = await get_prod_id()
            await Promise.map(
                store_prod_ids,
                async (prod_id) => {
                    if (!db.hasOwnProperty(`${prod_id}-000`)) {
                        const new_info = (await pchome_handlers.prod_info(`${prod_id}-000`))[`${prod_id}-000`]
                        const button = (await pchome_handlers.button_info(`${prod_id}-000`))[0]
                        new_info.Qty = button.Qty
                        new_info.ButtonType = button.ButtonType
                        new_info.SaleStatus = button.SaleStatus
                        console.log(`新商品上架 ${new_info.Name}`)
                        await line_notify(message_template('新商品上架', new_info))
                        new_info.update_at = moment().tz('Asia/Taipei').format()
                        db[`${prod_id}-000`] = new_info
                        await fs.outputJson(db_des, db)
                    }
                    return true
                },
                { concurrency: 1 }
            )
        }

        if (argv.job === 'test') {
            await line_notify('測試訊息')
            console.log('測試訊息已發送')
            return process.exit(0)
        }
        if (argv.job === 'init') {
            const prod_ids = await get_prod_id()
            const prods = await pchome_handlers.prod_info(prod_ids.join(','))
            const buttons = await pchome_handlers.button_info(prod_ids.join(','))
            prod_ids.map((prod_id) => {
                const button = buttons.find((button) => {
                    return button.Id === `${prod_id}-000`
                })
                prods[`${prod_id}-000`].Qty = button.Qty
                prods[`${prod_id}-000`].ButtonType = button.ButtonType
                return true
            })
            await fs.outputJson(db_des, prods)
            console.log('產品訊息已擷取')
            return process.exit(0)
        }
        if (argv.job === 'inspect') {
            await inspect().catch((err) => {
                console.log(err)
            })
            console.log('done')
            return process.exit(0)
        }

        const job = new CronJob({
            cronTime: `0 */${process.env.interval || 5} * * * *`,
            onTick: async () => {
                console.log(`job start ${moment().tz('Asia/Taipei').format()}`)
                await inspect().catch((err) => {
                    console.log(err)
                })
            },
            start: true,
            timeZone: 'Asia/Taipei'
        })
        console.log('is job running? ', job.running)
    } catch (err) {
        console.log(err)
    }
})()
