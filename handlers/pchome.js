const got = require('got')
const async = require('async')

const info_parse = (info) => {
    info = info.replace('try{jQuery111103710843696499564_1584096535427(', '')
    info = info.replace('try{jsonp_cartsnapup(', '')
    info = info.replace('try{jsonp_prod(', '')
    info = info.replace('try{json_search(', '')
    info = info.replace('try{jsonp_prodbutton(', '')
    info = info.replace('try{jsonp_prodget(', '')
    info = info.replace(');}catch(e){if(window.console){console.log(e);}}', '')
    return JSON.parse(info)
}

exports.search = async (keyword, min, max, page = 1) => {
    const price = min ? `&price=${min}-${max}` : ''
    const options = {
        method: 'GET',
        url: `https://ecshweb.pchome.com.tw/search/v3.3/24h/results?q=${keyword}&page=${page}&sort=sale/dc${price}`,
        responseType: 'json',
        resolveBodyOnly: true
    }
    const result = await got(options)
    return result
}

exports.store_search = async (store_id, min, max, page = 1) => {
    const result = await async
        .forever(async () => {
            const price = min ? `&price=${min}-${max}` : ''
            const options = {
                method: 'GET',
                url: `https://ecshweb.pchome.com.tw/searchplus/v1/index.php/all/category/${store_id}/results?sort=sale/dc${price}&show=list&page=${page}&callback=json_search`,
                resolveBodyOnly: true
            }
            const result = await got(options).catch((err) => {
                console.log(err.message)
                return { err: true }
            })
            if (!result.err) {
                return Promise.reject(result)
            }
            await sleep(10000)
        })
        .catch((result) => {
            return result.message
        })
    return info_parse(result)
}

exports.button_info = async (prod_id) => {
    const result = await async
        .forever(async () => {
            const options = {
                method: 'GET',
                url: `https://24h.m.pchome.com.tw/ecapi/ecshop/prodapi/v2/prod/button&id=${prod_id}&fields=Seq,Id,Price,Qty,ButtonType,SaleStatus,isPrimeOnly,SpecialQty&_callback=jsonp_prodbutton&1570249800?_callback=jsonp_prodbutton`,
                resolveBodyOnly: true
            }
            const result = await got(options).catch((err) => {
                console.log(err.message)
                return { err: true }
            })
            if (!result.err) {
                return Promise.reject(result)
            }
            await sleep(10000)
        })
        .catch((result) => {
            return result.message
        })
    return info_parse(result)
}

exports.prod_info = async (prod_id) => {
    const result = await async
        .forever(async () => {
            const options = {
                method: 'GET',
                url: `https://24h.m.pchome.com.tw/ecapi/ecshop/prodapi/v2/prod?id=${prod_id}&fields=Seq,Id,Name,Nick,Store,PreOrdDate,SpeOrdDate,Price,Discount,Pic,Weight,ISBN,Qty,Bonus,isBig,isSpec,isCombine,isDiy,isRecyclable,isCarrier,isMedical,isBigCart,isSnapUp,isDescAndIntroSync,isFoodContents,isHuge,isEnergySubsidy,isPrimeOnly,isPreOrder24h,isWarranty,isLegalStore,isOnSale,isPriceTask,isFresh,isBidding,isSet&_callback=jsonp_prodget&_callback=jsonp_prodget`,
                resolveBodyOnly: true
            }
            const result = await got(options).catch((err) => {
                console.log(err.message)
                return { err: true }
            })
            if (!result.err) {
                return Promise.reject(result)
            }
            await sleep(10000)
        })
        .catch((result) => {
            return result.message
        })
    return info_parse(result)
}
