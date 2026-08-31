<?php
// Screenshot (local file provided): /mnt/data/9d05e851-7067-48fe-9825-fe6135ff1f23.png

// Exit if accessed directly
if ( !defined( 'ABSPATH' ) ) exit;

// BEGIN ENQUEUE PARENT ACTION
if ( !function_exists( 'chld_thm_cfg_locale_css' ) ):
    function chld_thm_cfg_locale_css( $uri ){
        if ( empty( $uri ) && is_rtl() && file_exists( get_template_directory() . '/style.css' ) )
            $uri = get_template_directory_uri() . '/style.css';
        return $uri;
    }
endif;
add_filter( 'locale_stylesheet_uri', 'chld_thm_cfg_locale_css' );

// END ENQUEUE PARENT ACTION
// -----------------------------------------
// ENQUEUE CHILD THEME CUSTOM ASSETS CSS
// -----------------------------------------
function my_child_theme_custom_styles() {

    wp_enqueue_style(
        'parent-style',
        get_template_directory_uri() . '/style.css'
    );
    wp_enqueue_style(
        'child-style',
        get_stylesheet_uri(),
        array('parent-style')
    );
    wp_enqueue_style(
        'child-custom-style',
        get_stylesheet_directory_uri() . '/assets/css/style.css',
        array('child-style'),
        filemtime( get_stylesheet_directory() . '/assets/css/style.css' ) 	
    );

    $js_rel_path = '/assets/js/custom.js';
    $js_file_path = get_stylesheet_directory() . $js_rel_path;
    $js_file_uri  = get_stylesheet_directory_uri() . $js_rel_path;

    // Use filemtime for version if file exists (prevents caching and avoids warnings)
    $js_version = null;
    if ( file_exists( $js_file_path ) ) {
        $js_version = filemtime( $js_file_path );
    }


	   // Slick-Slider-CSS
		wp_enqueue_style(
			'slick-css',
			get_stylesheet_directory_uri() . '/assets/css/slick.css',
			array(),
			filemtime( get_stylesheet_directory() . '/assets/css/slick.css' )
		);

		// Slick-Slider-JS
		wp_enqueue_script(
			'slick-js',
			get_stylesheet_directory_uri() . '/assets/js/slick.js',
			array('jquery'),
			filemtime( get_stylesheet_directory() . '/assets/js/slick.js' ),
			true
		);

		wp_enqueue_script(
		'custom-script',
		get_stylesheet_directory_uri() . '/assets/js/custom.js',
		array('jquery'),
		filemtime( get_stylesheet_directory() . '/assets/js/custom.js' ),
		true
	);
	
	

}
add_action( 'wp_enqueue_scripts', 'my_child_theme_custom_styles' );



//Promotions
add_action( 'init', 'promotions_posttype' );   
function promotions_posttype() {

    $labels = array( 
        'name'               => __('Promotions'), 
        'singular_name'      => __('Promotion'), 
        'add_new'            => __('Add New'), 
        'add_new_item'       => __('Add New'), 
        'edit_item'          => __('Edit Promotion'), 
        'new_item'           => __('New Promotion'), 
        'view_item'          => __('View Promotion'), 
        'search_items'       => __('Search Promotions'), 
        'not_found'          => __('Nothing found'), 
        'not_found_in_trash' => __('Nothing found in Trash') 
    );   

    $args = array( 
        'labels'             => $labels, 
        'public'             => true, 
        'publicly_queryable' => true, 
        'show_ui'            => true, 
        'show_in_rest'       => true, 
        'query_var'          => true, 
        'rewrite'            => array( 'slug' => 'promotions', 'with_front'=> true ), 
        'capability_type'    => 'post', 
        'hierarchical'       => false,
        'has_archive'        => true,  
        'menu_position'      => null, 
        'supports'           => array('title','editor','thumbnail', 'excerpt')
    );
    register_post_type( 'promotions' , $args ); 

    // Custom taxonomy
    register_taxonomy( 'promotions-categories', array('promotions'), array(
        'hierarchical'      => true, 
        'label'             => 'Promotion Categories', 
        'singular_label'    => 'Promotion Category', 
        'rewrite'           => array( 'slug' => 'promotions-category', 'with_front'=> false ),
        'show_in_rest'      => true 
    ));
}


//Events
add_action( 'init', 'events_posttype' );   
function events_posttype() {

    $labels = array( 
        'name'               => __('Events'), 
        'singular_name'      => __('Event'), 
        'add_new'            => __('Add New'), 
        'add_new_item'       => __('Add New'), 
        'edit_item'          => __('Edit Event'), 
        'new_item'           => __('New Event'), 
        'view_item'          => __('View Event'), 
        'search_items'       => __('Search Events'), 
        'not_found'          => __('Nothing found'), 
        'not_found_in_trash' => __('Nothing found in Trash') 
    );   

    $args = array( 
        'labels'             => $labels, 
        'public'             => true, 
        'publicly_queryable' => true, 
        'show_ui'            => true, 
        'show_in_rest'       => true, 
        'query_var'          => true, 
        'rewrite'            => array( 'slug' => 'events', 'with_front'=> true ), 
        'capability_type'    => 'post', 
        'hierarchical'       => false,
        'has_archive'        => true,  
        'menu_position'      => null, 
        'supports'           => array('title','editor','thumbnail', 'excerpt')
    );
    register_post_type( 'events' , $args ); 

    // Custom taxonomy
    register_taxonomy( 'events-categories', array('events'), array(
        'hierarchical'      => true, 
        'label'             => 'Event Categories', 
        'singular_label'    => 'Event Category', 
        'rewrite'           => array( 'slug' => 'events-category', 'with_front'=> false ),
        'show_in_rest'      => true 
    ));
}


// Testimonials

function register_testimonials_cpt() {

    $labels = array(
        'name'               => 'Testimonials',
        'singular_name'      => 'Testimonial',
        'add_new'            => 'Add New',
        'add_new_item'       => 'Add New Testimonial',
        'edit_item'          => 'Edit Testimonial',
        'all_items'          => 'All Testimonials'
    );

    $args = array(
        'labels'             => $labels,
        'public'             => true,
        'menu_icon'          => 'dashicons-format-quote',
        'supports'           => array('title', 'editor', 'thumbnail'),
    );

    register_post_type('testimonial', $args);
}

add_action('init', 'register_testimonials_cpt');



function custom_footer_widgets_init() {

    // Footer Logo
    register_sidebar(array(
        'name'          => 'Footer Logo',
        'id'            => 'footer_logo',
        'before_widget' => '<div class="footer-logo">',
        'after_widget'  => '</div>',
    ));

    // Footer Info List
    register_sidebar(array(
        'name'          => 'Footer Info',
        'id'            => 'footer_info',
        'before_widget' => '<div class="footer-info">',
        'after_widget'  => '</div>',
    ));

    // Footer Social Icons
    register_sidebar(array(
        'name'          => 'Footer Social',
        'id'            => 'footer_social',
        'before_widget' => '<div class="footer-social">',
        'after_widget'  => '</div>',
    ));

    // Footer Bottom Links
    register_sidebar(array(
        'name'          => 'Footer Bottom Links',
        'id'            => 'footer_bottom_links',
        'before_widget' => '<div class="footer-bottom-links">',
        'after_widget'  => '</div>',
    ));

}
add_action('widgets_init', 'custom_footer_widgets_init');

// -----------------------------------------
// BOOKING-APP EVENT SYNC (WOLASYNC 20260831) — DO NOT REMOVE
// Pulls events published from booking.wolastoqcasino.ca and stores them
// locally for inc/wola-events.php to merge. Must load on EVERY request (not
// just the three event templates) because it registers the REST push endpoint
// and the WP-Cron refresh. Rendering never makes an HTTP call.
// -----------------------------------------
$wola_booking_sync = get_stylesheet_directory() . '/inc/wola-booking-sync.php';
if ( file_exists( $wola_booking_sync ) ) {
    require_once $wola_booking_sync;
}

// -----------------------------------------
// FEATURED EVENT (ACF) for the Events Redesign page template
// -----------------------------------------
$wola_featured_event_fields = get_stylesheet_directory() . '/inc/featured-event-fields.php';
if ( file_exists( $wola_featured_event_fields ) ) {
    require_once $wola_featured_event_fields;
}

// -----------------------------------------
// Force the custom Player Rewards template for the /rewards/ page
// (overrides any page template / builder content assigned to it)
// -----------------------------------------
add_filter( 'template_include', function( $template ) {
    // Front page -> redesigned home template (original home.php kept as fallback)
    if ( function_exists( 'is_front_page' ) && is_front_page() && ! is_admin() ) {
        $home = get_stylesheet_directory() . '/home-redesign.php';
        if ( file_exists( $home ) ) {
            return $home;
        }
    }
    if ( function_exists( 'is_page' ) && is_page( 'rewards' ) ) {
        $custom = get_stylesheet_directory() . '/page-rewards.php';
        if ( file_exists( $custom ) ) {
            return $custom;
        }
    }
    // Casino game pages -> redesigned game template (original games.php kept as fallback)
    if ( function_exists( 'is_page' ) && is_page( array( 'classic-slots', 'blackjack', 'roulette', 'poker', 'baccarat' ) ) ) {
        $gt = get_stylesheet_directory() . '/game-redesign.php';
        if ( file_exists( $gt ) ) {
            return $gt;
        }
    }
    return $template;
}, 99 );

// -----------------------------------------
// "Coming soon" game pages (no DB page): Ultimate Texas Hold'Em & Let It Ride
// -----------------------------------------
add_action( 'template_redirect', function () {
    $path = trim( parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ), '/' );
    $soon = array(
        'ultimate-texas-holdem' => array( 'Ultimate Texas Hold&rsquo;Em', 'an exciting poker-based table game where you go head-to-head with the dealer using Texas Hold&rsquo;em rules and shared community cards' ),
        'let-it-ride'           => array( 'Let It Ride', 'a relaxed poker-style table game where you aim to build a winning five-card hand &mdash; and can pull back your bets as the cards are revealed' ),
    );
    if ( isset( $soon[ $path ] ) ) {
        $tpl = get_stylesheet_directory() . '/coming-soon.php';
        if ( file_exists( $tpl ) ) {
            status_header( 200 );
            if ( isset( $GLOBALS['wp_query'] ) ) { $GLOBALS['wp_query']->is_404 = false; }
            $name = $soon[ $path ][0];
            add_filter( 'pre_get_document_title', function () use ( $name ) {
                return html_entity_decode( $name ) . ' — Coming Soon | Wolastoq Casino';
            } );
            $GLOBALS['wola_soon'] = array( 'name' => $soon[ $path ][0], 'blurb' => $soon[ $path ][1], 'slug' => $path );
            include $tpl;
            exit;
        }
    }
} );
