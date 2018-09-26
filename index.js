'use strict'

const api = {
	url: 'https://1.bvg.transport.rest/locations',
	adapter: (res) => res.map((e) => e.name)
}

const h = require('hyperscript')
const autocomplete = require('horsey')
const fetch = require('fetch-ponyfill')().fetch
const querystring = require('querystring').stringify
const moment = require('moment-timezone')
const clone = require('clone')
const roundTo = require('round-to')
const numSort = require('num-sort')
const numberFormatter = require('number-formatter')

const random = () => Math.round(Math.random()*10000000)
const round = (e) => roundTo(e, 2)
const roundCal = (e) => Math.round(e) //Math.round(e/1000)*1000
// const toGermanNo = (e) => (e+'').split('.').join(',')
const toGermanNo = (e) => numberFormatter('#.##0,##', e)
const toGermanNo2 = (e) => ((e>0) ? '+ ' : ((e===0) ? '± ' : '- ')) + numberFormatter('#.##0,##', Math.abs(e))

const addAutocomplete = (routeID) => {
	autocomplete(document.querySelector('#'+routeID+' .origin'), {
		suggestions: (value, done) => {
			fetch(api.url+'?'+querystring({query: value}), {
				method: "get",
				mode: "cors"
			}).then((r) => r.json()).then(api.adapter).then((res) => done(res))
		},
		limit: 5,
		appendTo: document.querySelector('#'+routeID+' .originContainer'),
		autoHideOnClick: true,
		autoHideOnBlur: true
	})

	autocomplete(document.querySelector('#'+routeID+' .destination'), {
		suggestions: (value, done) => {
			fetch(api.url+'?'+querystring({query: value}), {
				method: "get",
				mode: "cors"
			}).then((r) => r.json()).then(api.adapter).then((res) => done(res))
		},
		limit: 5,
		appendTo: document.querySelector('#'+routeID+' .destinationContainer'),
		autoHideOnClick: true,
		autoHideOnBlur: true
	})
}

addAutocomplete('r0')

const countDays = (d) => {
	let c = 0
	for(let day in d){
		if(d[day]) c++
	}
	return c
}

const checkParams = (id) => {
	const origin = document.querySelector('#'+id).querySelector('.origin').value
	const destination = document.querySelector('#'+id).querySelector('.destination').value
	const time = document.querySelector('#'+id).querySelector('.time').value
	const abAn = document.querySelector('#'+id).querySelector('input[name="ab-an-'+id+'"]:checked').value
	const days = {
		mo: document.querySelector('#'+id).querySelector('#mo-'+id).checked,
		di: document.querySelector('#'+id).querySelector('#di-'+id).checked,
		mi: document.querySelector('#'+id).querySelector('#mi-'+id).checked,
		do: document.querySelector('#'+id).querySelector('#do-'+id).checked,
		fr: document.querySelector('#'+id).querySelector('#fr-'+id).checked,
		sa: document.querySelector('#'+id).querySelector('#sa-'+id).checked,
		so: document.querySelector('#'+id).querySelector('#so-'+id).checked
	}
	if(
		!origin
	||	!destination
	||	!time
	||	time.length!=5
	||	['ab', 'an'].indexOf(abAn)<0
	||	countDays(days)===0
	) return false
	else return ({
		origin,
		destination,
		time,
		abAn,
		days
	})
}

const formatParams = (params) => {
	return Promise.all(params.map((p) => Promise.all([
		fetch(api.url+'?'+querystring({query: p.origin}), {
			method: "get",
			mode: "cors"
		}).then((r) => r.json()),
		fetch(api.url+'?'+querystring({query: p.destination}), {
			method: "get",
			mode: "cors"
		}).then((r) => r.json())
	])
	.then(([o, d]) => [o[0], d[0]])
	.then(([o, d]) => ({
		origin: {
			latitude: o.coordinates.latitude,
			longitude: o.coordinates.longitude
		},
		destination: {
			latitude: d.coordinates.latitude,
			longitude: d.coordinates.longitude
		},
		time: {
			type: (p.abAn === 'ab') ? 'departure' : 'arrival',
			value: +(moment.tz(p.time, 'HH:mm', 'Europe/Berlin').day(9))
		}
	}))
	.then((res) => {
		const result = []
		for(let i=0; i<countDays(p.days); i++){
			result.push(res)
		}
		return result
	})))
	.then((r) => {
		const res = [].concat(...r)
		return res
	})
	.then((req) =>
		fetch('https://api.umsteigen.jetzt/', {
			method: "post",
			mode: "cors",
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({routes: req})
		})
	)
	.then((res) => res.json())
}

const clearTable = () => {
	Array.from(document.querySelectorAll('.entry')).map((el) => {el.innerHTML=''; el.setAttribute('class', 'entry')})
}

const units = {
	'duration': ' h',
	'calories': ' kcal tägl.',
	'greenhouse': ' kg',
	'price': ' €',
	'risk': ' ‰'
}

const scaleData = (d) => {
	const e = clone(d)
	for(let type in e){
		e[type]['duration'] *= 48
		e[type]['greenhouse'] *= 48
		e[type]['calories'] /= 7
		e[type]['price'] *= 48
		e[type]['risk'] *= 48
	}
	return e
}

const formatData = (d) => {
	const e = clone(d)
	for(let type in e){
		e[type]['duration'] = Math.round(e[type]['duration'] / (1000 * 60 * 60))
		e[type]['greenhouse'] = round(e[type]['greenhouse']/1000)
		e[type]['calories'] = roundCal(e[type]['calories'])
		e[type]['price'] = Math.round(e[type]['price'])
		e[type]['risk'] = round(e[type]['risk'])
	}
	return e
}

const getExtrema = (d) => {
	const values = {
		calories: [],
		greenhouse: [],
		price: [],
		duration: [],
		risk: []
	}
	for(let type in d){
		for(let column in d[type]) values[column].push(d[type][column])
	}
	for(let key in values){
		values[key] = values[key].sort(numSort.asc)
		values[key] = {
			min: values[key][0],
			max: values[key][values[key].length-1]
		}
	}
	return values
}

const compareData = (d) => {
	const e = clone(d)
	for(let type in e){
		for(let column in d[type]){
			e[type][column] = d[type][column] - d['car'][column]
		}
	}
	return e
}

const enterData = (d) => {
	const f = clone(d)
	const oldLever = document.querySelector('#lever')
	const newLever = oldLever.cloneNode(true)
	oldLever.parentNode.replaceChild(newLever, oldLever)

	clearTable()
	d = scaleData(d)
	d = formatData(d)
	const extr = getExtrema(d)
	for(let type in d){
		for(let column in d[type]){
			if(
				(d[type][column]===extr[column].max && column==='calories')
			||	(d[type][column]===extr[column].min && ['price', 'duration', 'greenhouse', 'risk'].indexOf(column)>=0)
			) document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry best')
			else if(
				(d[type][column]===extr[column].min && column==='calories')
			||	(d[type][column]===extr[column].max && ['price', 'duration', 'greenhouse', 'risk'].indexOf(column)>=0)
			) document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry worst')
			else document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry average')
			document.querySelector(`#${type}-${column}`).innerHTML = toGermanNo(d[type][column])+units[column]
		}
	}
	document.querySelector('#lever').addEventListener('change', (ev) => {
		if(ev.target.checked){
			enterComparedData(f)
		}
		else{
			enterData(f)
		}
	})
}

const enterComparedData = (d) => {
	clearTable()
	d = scaleData(d)
	d = compareData(d)
	d = formatData(d)
	for(let type in d){
		for(let column in d[type]){
			if(column === 'calories'){
				if(d[type][column] < 0) document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry less '+type)
				else if(d[type][column] === 0) document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry equal '+type)
				else document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry more '+type)
			}
			else{
				if(d[type][column] > 0) document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry less '+type)
				else if(d[type][column] === 0) document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry equal '+type)
				else document.querySelector(`#${type}-${column}`).setAttribute('class', 'entry more '+type)
			}
			document.querySelector(`#${type}-${column}`).innerHTML = toGermanNo2(d[type][column])+units[column]
		}
	}
}

const start = () => {
	document.querySelector('#page3').style.display='none'
	document.querySelector('#loaderBox').style.display='initial'
	document.querySelector('#toResults').style.display='none'
	document.querySelector('#lever').checked=false
	const ids = Array.from(document.querySelectorAll('.route:not(#lastRoute)')).map((e) => e.getAttribute('id'))
	const params = ids.map(checkParams)
	if(params.some((p) => !p)){
		document.querySelector('#error').innerHTML = 'Bitte füllen Sie alle Felder aus.'
	}
	else{
		document.querySelector('#error').innerHTML = '&nbsp;'
		document.querySelector('#page2').style.display='flex'
		document.querySelector('#page2').scrollIntoView({
			behavior: 'smooth'
		})

		formatParams(params)
		.then(enterData)
		.then(() => {
			document.querySelector('#page3').style.display='flex'
			document.querySelector('#loaderBox').style.display='none'
			document.querySelector('#toResults').style.display='initial'
			// document.querySelector('#page3').scrollIntoView({
  	// 			behavior: 'smooth'
			// })
		})
		.catch(() => {
			document.querySelector('#page3').style.display='none'
			document.querySelector('#page').scrollIntoView({
				behavior: 'smooth'
			})
			document.querySelector('#page2').style.display='none'
			document.querySelector('#loaderBox').style.display='initial'
			document.querySelector('#toResults').style.display='none'
			document.querySelector('#error').innerHTML = 'Bitte füllen Sie alle Felder aus.'
		})
	}
}

document.querySelector('#los').addEventListener('click', start)

document.querySelector('body').addEventListener('click', (ev) => {
	const element = ev.target
	if(element.getAttribute('class') === 'removeRoute')
		removeRoute(element)
	if(element.getAttribute('id') === 'addRoute')
		addRoute()
})

document.querySelector('#toResults').addEventListener('click', (ev) => {
	document.querySelector('#page3').scrollIntoView({
			behavior: 'smooth'
	})
})

const generateRoute = (id) =>
	h('div.route', {id},
		h('div.inputGroup',
			h('div.originContainer.placeContainer',
				h('input.text.origin', {type: 'text', placeholder: 'Start'})
			),
			' ',
			h('div.destinationContainer.placeContainer',
				h('input.text.destination', {type: 'text', placeholder: 'Ziel'})
			)
		),
		h('div.inputGroup.timeGroup',
			h('div.timeDir',
				h('input', {id: 'ab-'+id, value: 'ab', type: 'radio', name: 'ab-an-'+id}),
				h('label', {htmlFor: 'ab-'+id}, 'Ab'),
				' ',
				h('input', {id: 'an-'+id, value: 'an', type: 'radio', name: 'ab-an-'+id, checked: 'true'}),
				h('label', {htmlFor: 'an-'+id}, 'An')
			),
			h('input.text.time', {type: 'text', placeholder: '08:00'})
		),
		h('div.inputGroup',
			h('div.days',
				h('input.mo.day', {id: 'mo-'+id, name: 'day-'+id, type: 'checkbox'}),
				h('label', {htmlFor: 'mo-'+id}, 'Mo'),
				' ',
				h('input.di.day', {id: 'di-'+id, name: 'day-'+id, type: 'checkbox'}),
				h('label', {htmlFor: 'di-'+id}, 'Di'),
				' ',
				h('input.mi.day', {id: 'mi-'+id, name: 'day-'+id, type: 'checkbox'}),
				h('label', {htmlFor: 'mi-'+id}, 'Mi'),
				' ',
				h('input.do.day', {id: 'do-'+id, name: 'day-'+id, type: 'checkbox'}),
				h('label', {htmlFor: 'do-'+id}, 'Do'),
				' ',
				h('input.fr.day', {id: 'fr-'+id, name: 'day-'+id, type: 'checkbox'}),
				h('label', {htmlFor: 'fr-'+id}, 'Fr'),
				' ',
				h('input.sa.day', {id: 'sa-'+id, name: 'day-'+id, type: 'checkbox'}),
				h('label', {htmlFor: 'sa-'+id}, 'Sa'),
				' ',
				h('input.so.day', {id: 'so-'+id, name: 'day-'+id, type: 'checkbox'}),
				h('label', {htmlFor: 'so-'+id}, 'So')
			)
		),
		h('div.inputGroup',
			h('a.removeRoute', {href: '#'}, '❌')
		)
	)

const addRoute = () => {
	const rID = 'r'+random()
	document.getElementById('routes').insertBefore(generateRoute(rID), document.querySelector('#lastRoute'))
	addAutocomplete(rID)
	document.querySelector('#'+rID+' .origin').addEventListener('horsey-selected', () => {
		document.querySelector('#'+rID+' .destination').focus()
	})
}

const removeRoute = (el) => el.parentElement.parentElement.remove()

// Array.from(document.getElementsByClassName('removeRoute')).map((e) => e.addEventListener('click', (el) => removeRoute(el.target)))

// document.getElementById('addRoute').addEventListener('click', addRoute)
