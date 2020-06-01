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

        const store_urls = process.env.store_url.split(',')

        const sleep = (time) => {
            return new Promise((resolve) => setTimeout(resolve, time))
        }
        const pchome_prod_id = (url) => {
            const path = urlparse(url).pathname.split('/')
            const prod_id = path[path.length - 1]
            return prod_id
        }
        const pchome_store_id = (url) => {
            const path = urlparse(url).pathname.split('/')
            const store_id = path[path.length - 1]
            return store_id
        }
        const pchome_prod_api = (prod_id) => {
            return `https://24h.m.pchome.com.tw/ecapi/ecshop/prodapi/v2/prod?id=${prod_id}&fields=Seq,Id,Name,Nick,Store,PreOrdDate,SpeOrdDate,Price,Discount,Pic,Weight,ISBN,Qty,Bonus,isBig,isSpec,isCombine,isDiy,isRecyclable,isCarrier,isMedical,isBigCart,isSnapUp,isDescAndIntroSync,isFoodContents,isHuge,isEnergySubsidy,isPrimeOnly,isPreOrder24h,isWarranty,isLegalStore,isOnSale,isPriceTask,isFresh,isBidding,isSet&_callback=jsonp_prodget&_callback=jsonp_prodget`
        }
        const pchome_button_api = (prod_id) => {
            return `https://24h.m.pchome.com.tw/ecapi/ecshop/prodapi/v2/prod/button&id=${prod_id}&fields=Seq,Id,Price,Qty,ButtonType,SaleStatus,isPrimeOnly,SpecialQty&_callback=jsonp_prodbutton&1570249800?_callback=jsonp_prodbutton`
        }
        const pchome_store_api = (store_id, page = 1) => {
            return `https://ecshweb.pchome.com.tw/searchplus/v1/index.php/all/category/${store_id}/results?sort=sale/dc&show=list&page=${page}&callback=json_search`
        }
        const pchome_count_api = (store_id) => {
            return `https://ecapi.pchome.com.tw/cdn/ecshop/prodapi/v2/store/${store_id}/prod/count&_callback=jsonp_prodcount?_callback=jsonp_prodcount`
        }
        const pchome_prod_url = (prod_id) => {
            return `https://24h.pchome.com.tw/prod/${prod_id}`
        }
        const pchome_info_parse = (info) => {
            info = info.replace('try{jsonp_prod(', '')
            info = info.replace('try{json_search(', '')
            info = info.replace('try{jsonp_prodbutton(', '')
            info = info.replace('try{jsonp_prodget(', '')
            info = info.replace(');}catch(e){if(window.console){console.log(e);}}', '')
            return JSON.parse(info)
        }
        const get_prod_id = async () => {
            const prods = await Promise.reduce(
                store_urls,
                async (array, store_url) => {
                    const options = {
                        method: 'GET',
                        url: pchome_store_api(pchome_store_id(store_url), 1),
                        resolveBodyOnly: true
                    }
                    const { totalRows, totalPage } = pchome_info_parse(await got(options))
                    const prods = await Promise.reduce(
                        [...Array(totalPage)],
                        async (array, _array, index) => {
                            const options = {
                                method: 'GET',
                                url: pchome_store_api(pchome_store_id(store_url), index + 1),
                                resolveBodyOnly: true
                            }
                            let prods = pchome_info_parse(await got(options)).prods || []
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
                moment().format('YYYY/MM/DD HH:mm:ss') +
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

        if (argv.job === 'test') {
            await line_notify('測試訊息')
            console.log('測試訊息已發送')
            return process.exit(0)
        }
        if (argv.job === 'init') {
            const prod_ids = await get_prod_id()
            const options = {
                method: 'GET',
                url: pchome_prod_api(prod_ids.join(',')),
                resolveBodyOnly: true
            }
            const prods = pchome_info_parse(await got(options))
            options.url = pchome_button_api(prod_ids.join(','))
            const buttons = pchome_info_parse(await got(options))
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

        const inspect = async () => {
            const prod_ids = Object.keys(db)
            const options = {
                method: 'GET',
                url: pchome_button_api(prod_ids.join(',')),
                resolveBodyOnly: true
            }
            const new_infos = pchome_info_parse(await got(options))
            await sleep(2000)
            await Promise.map(new_infos, async (new_info) => {
                const prod_id = new_info.Id
                const old_info = db[prod_id]
                if (!old_info) {
                    return true
                }
                db[prod_id].Qty = new_info.Qty
                db[prod_id].Price = new_info.Price
                db[prod_id].ButtonType = new_info.ButtonType
                if (new_info.Qty > old_info.Qty) {
                    console.log(`商品進貨 ${new_info.Name}`)
                    await line_notify(message_template('商品進貨', db[prod_id]))
                } else if (new_info.Qty === 0 && old_info.Qty !== 0) {
                    console.log(`商品售完 ${new_info.Name}`)
                    await line_notify(message_template('商品售完', db[prod_id]))
                } else if (new_info.ButtonType !== old_info.ButtonType) {
                    console.log(`狀態改變 ${new_info.Name}`)
                    await line_notify(message_template('狀態改變', db[prod_id]))
                }
                await fs.outputJson(db_des, db)
            })
            const store_prod_ids = await Promise.reduce(
                store_urls,
                async (array, store_url) => {
                    const options = {
                        method: 'GET',
                        url: pchome_store_api(pchome_store_id(store_url), 1),
                        resolveBodyOnly: true
                    }
                    const { totalRows, totalPage } = pchome_info_parse(await got(options))
                    await sleep(2000)
                    const prods = await Promise.reduce(
                        [...Array(totalPage)],
                        async (array, _array, index) => {
                            const options = {
                                method: 'GET',
                                url: pchome_store_api(pchome_store_id(store_url), index + 1),
                                resolveBodyOnly: true
                            }
                            let prods = pchome_info_parse(await got(options)).prods || []
                            await sleep(2000)
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
            await Promise.map(
                store_prod_ids,
                async (prod_id) => {
                    if (!db.hasOwnProperty(`${prod_id}-000`)) {
                        const options = {
                            method: 'GET',
                            url: pchome_prod_api(prod_id),
                            resolveBodyOnly: true
                        }
                        const new_info = pchome_info_parse(await got(options))[`${prod_id}-000`]
                        options.url = pchome_button_api(prod_id)
                        const button = pchome_info_parse(await got(options))[0]
                        new_info.Qty = button.Qty
                        new_info.ButtonType = button.ButtonType
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
        const job = new CronJob({
            cronTime: `0 */${process.env.interval || 5} * * * *`,
            onTick: async () => {
                console.log(`job start ${moment().tz('Asia/Taipei').format()}`)
                await inspect().catch((err) => {
                    console.log(err.message)
                    console.log(err.options.url)
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
