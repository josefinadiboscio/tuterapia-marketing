-- Initial data.
--
-- pct_comision from METRICAS.md §3. It is revenue final, already net of the
-- gateway and everything else. Vigente_desde is set before the first record in
-- the database so every historical payment finds a value.
--
-- tipo_cambio is NOT seeded: it is loaded by hand, monthly, and has to be the
-- rate actually used to convert, not the official one.
insert into marketing.parametros (clave, pais, valor, vigente_desde)
values ('pct_comision', 'AR', 0.26, '2020-01-01'),
       ('pct_comision', 'UY', 0.30, '2020-01-01')
on conflict do nothing;

-- Mapping from METRICAS.md §7, plus the sources found in the data that no
-- pattern covered: fb-SiteLink (does not match meta%), sue%, test%, linkedin
-- and a bare `google` that is not google_ads.
--
-- `orden` decides when several patterns match: the more specific the pattern,
-- the lower the number.
insert into marketing.utm_mapping (patron, plataforma, superficie, es_pago, orden)
values ('google_ads',  'Google Ads', 'ads',       true,  10),
       ('gads%',       'Google Ads', 'ads',       true,  20),
       ('google',      'Google',     'organico',  false, 10),
       ('heylink.me',  'Instagram',  'historias', false, 10),
       ('chatgpt.com', 'ChatGPT',    'referral',  false, 10),
       ('linkedin',    'LinkedIn',   'organico',  false, 10),
       ('blog',        'Blog',       'organico',  false, 10),
       ('ig',          'Instagram',  'perfil',    false, 20),
       ('insta%',      'Instagram',  'perfil',    false, 30),
       ('tiktok',      'TikTok',     'ads',       true,  20),
       ('tk%',         'TikTok',     'ads',       true,  30),
       ('fb%',         'Meta',       'ads',       true,  30),
       ('meta%',       'Meta',       'ads',       true,  30),
       ('test%',       'Tests',      'organico',  false, 30),
       ('sue%',        'Sin definir', null,       false, 90)
on conflict (patron) do nothing;
