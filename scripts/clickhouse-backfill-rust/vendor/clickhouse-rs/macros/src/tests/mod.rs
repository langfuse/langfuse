use proc_macro2::TokenStream;
use std::str::FromStr;

mod cases;

macro_rules! render {
    ($($input:tt)*) => {
        ::insta::with_settings!({
            prepend_module_to_snapshot => false,
            omit_expression => true,
        }, {
            let input = ::std::stringify!($($input)*);
            let output = $crate::tests::_do_render(input);
            ::insta::assert_snapshot!(output);
        })
    };
}

fn _do_render(input_ugly: &str) -> String {
    let input_file_ast = syn::parse_file(input_ugly).expect("failed to parse input as file");
    let input_pretty = prettyplease::unparse(&input_file_ast);
    let input_tokens = TokenStream::from_str(input_ugly).expect("invalid input tokens");
    let input_derive_ast = syn::parse2(input_tokens).expect("failed to parse input");

    let output_tokens = crate::row_impl(input_derive_ast)
        .expect("failed to generate `impl Row`, use tests/ui for such tests");
    let output_ugly = output_tokens.to_string();
    let output_file_ast = syn::parse_file(&output_ugly).expect("failed to parse output as file");
    let output_pretty = prettyplease::unparse(&output_file_ast);

    format!("\n{input_pretty}\n/****** GENERATED ******/\n{output_pretty}")
}

use render;
